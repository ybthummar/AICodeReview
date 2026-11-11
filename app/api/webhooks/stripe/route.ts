import { NextResponse } from "next/server";

// Stripe was replaced by Razorpay (see /api/webhooks/razorpay). This endpoint used to accept
// unsigned payloads and upgrade any user to PRO, so it now refuses every request.
export async function POST() {
  return NextResponse.json(
    { error: "Stripe webhooks are no longer supported" },
    { status: 410 }
  );
}
