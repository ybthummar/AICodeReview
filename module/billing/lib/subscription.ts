import prisma from "@/lib/db";
import { isProActive, nextPeriodEnd } from "@/lib/subscription";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

// Idempotent: the same Razorpay payment may arrive through both the verify route and the webhook.
export async function activateProPayment(input: {
  userId: string;
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
}): Promise<{ applied: boolean; endsAt: Date }> {
  const existing = await prisma.payment.findUnique({
    where: { paymentId: input.paymentId },
    select: { periodEndsAt: true },
  });
  if (existing) return { applied: false, endsAt: existing.periodEndsAt };

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { subscriptionTier: true, subscriptionStatus: true, subscriptionEndsAt: true },
  });
  if (!user) throw new Error("User not found");

  // Renewing while still active stacks onto the current end date.
  const currentEnd = isProActive(user) ? user.subscriptionEndsAt : null;
  const endsAt = nextPeriodEnd(currentEnd);

  try {
    await prisma.$transaction([
      prisma.payment.create({
        data: {
          paymentId: input.paymentId,
          orderId: input.orderId,
          userId: input.userId,
          amount: input.amount,
          currency: input.currency,
          periodEndsAt: endsAt,
        },
      }),
      prisma.user.update({
        where: { id: input.userId },
        data: {
          subscriptionTier: user.subscriptionTier === "ADMIN" ? "ADMIN" : "PRO",
          subscriptionStatus: "ACTIVE",
          subscriptionEndsAt: endsAt,
        },
      }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) return { applied: false, endsAt };
    throw error;
  }

  return { applied: true, endsAt };
}
