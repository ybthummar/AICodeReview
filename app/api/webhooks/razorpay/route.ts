import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

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

    if (signature && process.env.RAZORPAY_WEBHOOK_SECRET) {
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(body)
        .digest("hex");

      if (expectedSignature !== signature) {
        console.error("Invalid Razorpay webhook signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    }

    let payload: RazorpayWebhookPayload;
    try {
      payload = JSON.parse(body || "{}") as RazorpayWebhookPayload;
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const event = payload.event;
    console.log(`Received Razorpay webhook event: ${event}`);

    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;

    const userId =
      paymentEntity?.notes?.userId ||
      orderEntity?.notes?.userId;

    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionTier: "PRO",
          subscriptionStatus: "ACTIVE",
        },
      });
      console.log(`Razorpay webhook activated PRO tier for user ${userId}`);
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
