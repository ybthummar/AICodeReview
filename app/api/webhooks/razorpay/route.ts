import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { activateProPayment } from "@/module/billing/lib/subscription";

type RazorpayNotes = {
  userId?: string;
  email?: string;
};

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        notes?: RazorpayNotes;
      };
    };
    order?: {
      entity?: {
        id?: string;
        notes?: RazorpayNotes;
      };
    };
  };
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Without a verifiable signature anyone could upgrade any account, so reject.
    if (!webhookSecret) {
      console.error("RAZORPAY_WEBHOOK_SECRET is not configured; rejecting webhook");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    const signatureMatches =
      expectedSignature.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));

    if (!signatureMatches) {
      console.error("Invalid Razorpay webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    let payload: RazorpayWebhookPayload;
    try {
      payload = JSON.parse(body || "{}") as RazorpayWebhookPayload;
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const event = payload.event;
    console.log(`Received Razorpay webhook event: ${event}`);

    if (event !== "payment.captured" && event !== "order.paid") {
      return NextResponse.json({ received: true });
    }

    const payment = payload.payload?.payment?.entity;
    const order = payload.payload?.order?.entity;
    const userId = payment?.notes?.userId || order?.notes?.userId;

    if (userId && payment?.id) {
      const { applied, endsAt } = await activateProPayment({
        userId,
        paymentId: payment.id,
        orderId: payment.order_id || order?.id || "unknown",
        amount: payment.amount ?? 0,
        currency: payment.currency || "INR",
      });

      console.log(
        applied
          ? `Razorpay webhook activated PRO for user ${userId} until ${endsAt.toISOString()}`
          : `Razorpay payment ${payment.id} was already applied`
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error processing Razorpay webhook:", error);
    return NextResponse.json(
      { error: "Webhook handling failed" },
      { status: 500 }
    );
  }
}
