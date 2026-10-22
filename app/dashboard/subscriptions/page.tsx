/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
import { getDashboardStats } from "@/module/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface TierInfo {
  name: "FREE" | "PRO";
  price: string;
  description: string;
  features: string[];
}

const TIERS: Record<string, TierInfo> = {
  FREE: {
    name: "FREE",
    price: "₹0",
    description: "Perfect for getting started",
    features: [
      "1 connected repository",
      "Basic PR reviews",
      "Standard processing",
      "Community support",
    ],
  },
  PRO: {
    name: "PRO",
    price: "₹149",
    description: "For power users",
    features: [
      "Unlimited repositories",
      "Unlimited PR reviews",
      "Priority processing",
      "24/7 priority support",
      "Advanced analytics",
    ],
  },
};

function SubscriptionPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTier, setCurrentTier] = useState<"FREE" | "PRO" | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const paymentConfigured = Boolean(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID);

  useEffect(() => {
    async function fetchUserTier() {
      try {
        const subscriptionTier = await getDashboardStats();

        if (
          subscriptionTier?.subscriptionType?.subscriptionTier === "PRO" &&
          subscriptionTier?.subscriptionType?.subscriptionStatus === "ACTIVE"
        ) {
          setCurrentTier("PRO");
        } else {
          setCurrentTier("FREE");
        }
      } catch (err) {
        console.error("Failed to fetch subscription tier:", err);
        setCurrentTier("FREE");
      } finally {
        setIsLoadingStats(false);
      }
    }

    fetchUserTier();
  }, []);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  async function handleUpgrade() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/razorpay/checkout", {
        method: "POST",
      });

      if (!res.ok) {
        let message = "Checkout failed";

        try {
          const body = await res.json();
          message = body?.error || message;
        } catch {
          // Ignore JSON parse errors
        }

        throw new Error(message);
      }

      const data = await res.json();

      if (!data?.orderId || !data?.key) {
        throw new Error("Razorpay order is missing");
      }

      const Razorpay = (window as any).Razorpay;

      if (!Razorpay) {
        throw new Error("Razorpay checkout script is still loading. Please try again.");
      }

      const razorpay = new Razorpay({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        name: "RepoPilot",
        description: "RepoPilot PRO Membership",
        order_id: data.orderId,
        theme: {
          color: "#2563eb",
        },
        handler: async (response: any) => {
          try {
            setLoading(true);
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            if (!verifyRes.ok) {
              const errData = await verifyRes.json();
              throw new Error(errData?.error || "Payment verification failed");
            }

            setCurrentTier("PRO");
            window.location.href = `${window.location.origin}/dashboard/subscriptions?payment=success`;
          } catch (verifyErr: any) {
            console.error("Verification error:", verifyErr);
            setError(verifyErr.message || "Failed to verify payment with server");
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
          },
        },
      });

      razorpay.open();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  }

  // Show loading skeleton while fetching subscription data
  if (isLoadingStats) {
    return (
      <div className="min-h-screen px-4 sm:p-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
              Upgrade your plan
            </h1>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mt-10">
            {[1, 2].map((i) => (
              <div key={i} className="relative border rounded-lg p-6">
                {/* Tier Info Skeleton */}
                <div className="mb-6">
                  <Skeleton className="h-8 w-32 mb-2" />
                  <Skeleton className="h-4 w-48 mb-4" />
                  <div className="flex items-baseline gap-1 pb-1">
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>

                {/* Features List Skeleton */}
                <div className="mb-6 border-t border-zinc-200 pt-6">
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((j) => (
                      <div key={j} className="flex items-start gap-3">
                        <Skeleton className="w-5 h-5 rounded-full" />
                        <Skeleton className="h-4 flex-1" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Button Skeleton */}
                {i === 2 && <Skeleton className="h-10 w-full rounded-md" />}
                {i === 1 && <Skeleton className="h-6 w-32 mx-auto" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 sm:p-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
            Upgrade your plan
          </h1>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mt-10">
          {Object.values(TIERS).map((tier) => {
            const isCurrentPlan = currentTier === tier.name;
            const isFree = tier.name === "FREE";

            return (
              <div
                key={tier.name}
                className={`relative border rounded-lg p-6 transition-all ${
                  isCurrentPlan
                    ? "text-black shadow-lg border-2 border-blue-600 shadow-blue-100"
                    : "hover:border-blue-700"
                }`}
              >
                {isCurrentPlan && (
                  <div className="border-2 border-blue-700 absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                    Current Plan
                  </div>
                )}

                {/* Tier Info */}
                <div className="mb-6">
                  <h2 className="text-2xl font-bold mb-2 pb-1 leading-tight">{tier.name} Plan</h2>
                  <p className="text-zinc-500 text-sm mb-4">
                    {tier.description}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold leading-normal">{tier.price}</span>
                    {!isFree && <span className="text-zinc-500">/month</span>}
                  </div>
                </div>

                {/* Features List */}
                <div className="mb-6 border-t border-zinc-200 pt-6">
                  <ul className="space-y-3">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-green-500 mt-0.5" />
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Action Button */}
                {tier.name === "PRO" && (
                  <Button
                    onClick={handleUpgrade}
                    disabled={loading || isCurrentPlan || !paymentConfigured}
                    className={`w-full py-2 rounded-md font-medium transition-all ${
                      isCurrentPlan || !paymentConfigured
                        ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {isCurrentPlan ? (
                      "PRO Member"
                    ) : !paymentConfigured ? (
                      "Payment setup pending"
                    ) : loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Redirecting to Razorpay...
                      </span>
                    ) : (
                      "Upgrade to PRO"
                    )}
                  </Button>
                )}

                {tier.name === "FREE" && isCurrentPlan && (
                  <div className="w-full py-2 text-center text-sm text-zinc-500">
                    Your current plan
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-8 max-w-4xl mx-auto">
            <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-md p-3">
              <strong className="font-semibold">Error: </strong>
              {error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SubscriptionPage;
