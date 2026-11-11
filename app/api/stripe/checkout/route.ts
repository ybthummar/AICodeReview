import { NextResponse } from "next/server";

// Payments run through Razorpay (/api/razorpay/checkout); this legacy endpoint is retired.
export async function POST() {
  return NextResponse.json(
    { error: "Stripe checkout is no longer supported" },
    { status: 410 }
  );
}
