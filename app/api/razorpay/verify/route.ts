import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";

export async function POST(req: NextRequest) {
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

    // Verify HMAC SHA256 signature
    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      console.error("Razorpay signature mismatch:", {
        generated: generatedSignature,
        received: razorpay_signature,
      });
      return NextResponse.json(
        { error: "Invalid payment signature" },
        { status: 400 }
      );
    }

    // Upgrade user to PRO in database
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        subscriptionTier: "PRO",
        subscriptionStatus: "ACTIVE",
      },
    });

    console.log(
      `User ${session.user.id} (${session.user.email}) successfully upgraded to PRO tier via Razorpay payment ${razorpay_payment_id}`
    );

    return NextResponse.json({
      success: true,
      message: "Payment verified successfully. Welcome to PRO!",
      tier: updatedUser.subscriptionTier,
      status: updatedUser.subscriptionStatus,
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
