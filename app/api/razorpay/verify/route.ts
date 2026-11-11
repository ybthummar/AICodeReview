import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getRazorpay } from "@/lib/razorpay";
import { headers } from "next/headers";
import { activateProPayment } from "@/module/billing/lib/subscription";
import { recordAudit } from "@/module/audit/lib/audit";

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing required payment verification parameters" },
        { status: 400 }
      );
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      console.error("RAZORPAY_KEY_SECRET is not configured");
      return NextResponse.json(
        { error: "Payment verification configuration error" },
        { status: 500 }
      );
    }

    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const received = String(razorpay_signature);
    const signatureMatches =
      generatedSignature.length === received.length &&
      crypto.timingSafeEqual(Buffer.from(generatedSignature), Buffer.from(received));

    if (!signatureMatches) {
      console.error("Razorpay signature mismatch for order", razorpay_order_id);
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    // The order must belong to the signed-in user, otherwise someone could replay a leaked payment.
    const razorpay = getRazorpay();
    let amount = Number(process.env.RAZORPAY_PRO_AMOUNT || "14900");
    let currency = process.env.RAZORPAY_CURRENCY || "INR";

    if (razorpay) {
      const order = await razorpay.orders.fetch(razorpay_order_id);
      const orderOwner = (order.notes as Record<string, unknown> | undefined)?.userId;

      if (orderOwner !== session.user.id) {
        return NextResponse.json(
          { error: "This payment does not belong to your account" },
          { status: 403 }
        );
      }

      amount = Number(order.amount) || amount;
      currency = String(order.currency || currency);
    }

    const { applied, endsAt } = await activateProPayment({
      userId: session.user.id,
      paymentId: String(razorpay_payment_id),
      orderId: String(razorpay_order_id),
      amount,
      currency,
    });

    if (applied) {
      await recordAudit({
        userId: session.user.id,
        action: "subscription.activated",
        targetType: "payment",
        targetId: String(razorpay_payment_id),
        summary: `PRO activated until ${endsAt.toISOString().slice(0, 10)}`,
      });
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionTier: true, subscriptionStatus: true },
    });

    return NextResponse.json({
      success: true,
      message: "Payment verified successfully. Welcome to PRO!",
      tier: updatedUser?.subscriptionTier,
      status: updatedUser?.subscriptionStatus,
      endsAt: endsAt.toISOString(),
    });
  } catch (error) {
    console.error("Error during Razorpay payment verification:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Payment verification failed",
      },
      { status: 500 }
    );
  }
}
