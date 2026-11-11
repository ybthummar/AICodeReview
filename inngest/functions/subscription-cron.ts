import { inngest } from "../client";
import prisma from "@/lib/db";
import { escapeHtml, sendMail, wrapEmailTemplate } from "@/lib/mail";
import { APP_BASE_URL } from "@/lib/app-url";

const DAY_MS = 24 * 60 * 60 * 1000;

export const subscriptionMaintenance = inngest.createFunction(
  { id: "subscription-maintenance", retries: 1 },
  { cron: "TZ=Asia/Kolkata 0 9 * * *" },
  async ({ step }) => {
    // Access checks are time-based, so this only keeps the stored status honest for reports and the admin console.
    const expired = await step.run("expire-subscriptions", async () => {
      const result = await prisma.user.updateMany({
        where: {
          subscriptionTier: "PRO",
          subscriptionStatus: "ACTIVE",
          subscriptionEndsAt: { lt: new Date() },
        },
        data: { subscriptionStatus: "EXPIRED" },
      });
      return result.count;
    });

    // The one-day window means each user is reminded exactly once, three days before expiry.
    const reminded = await step.run("send-renewal-reminders", async () => {
      const now = Date.now();
      const users = await prisma.user.findMany({
        where: {
          subscriptionTier: "PRO",
          subscriptionStatus: "ACTIVE",
          subscriptionEndsAt: {
            gte: new Date(now + 2 * DAY_MS),
            lt: new Date(now + 3 * DAY_MS),
          },
        },
        select: { email: true, name: true, subscriptionEndsAt: true },
      });

      let sent = 0;
      for (const user of users) {
        try {
          const endDate = user.subscriptionEndsAt?.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          });

          await sendMail({
            to: user.email,
            subject: "Your RepoPilot PRO plan ends soon",
            html: wrapEmailTemplate(
              `<p>Hi ${escapeHtml(user.name)},</p>
               <p>Your PRO plan ends on <strong>${endDate}</strong>. After that your account returns to the Free plan limits.</p>
               <p><a href="${APP_BASE_URL}/dashboard/subscriptions">Extend your plan</a> to keep unlimited reviews, repositories and quality-gate checks.</p>`,
              "RepoPilot"
            ),
          });
          sent += 1;
        } catch (error) {
          console.warn(`Renewal reminder to ${user.email} failed:`, error);
        }
      }

      return sent;
    });

    return { expired, reminded };
  }
);
