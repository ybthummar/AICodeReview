import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendMailOptions {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendMail({
  to,
  subject,
  html,
  from = process.env.EMAIL_FROM || "RepoPilot <onboarding@resend.dev>",
  cc,
}: SendMailOptions) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emailPayload: any = {
      from,
      to,
      subject,
      html,
    };

    if (cc && cc !== to) {
      emailPayload.cc = cc;
    }

    let response = await resend.emails.send(emailPayload);

    // If Resend rejected because the custom domain is unverified, auto-fallback to onboarding@resend.dev
    if (
      response.error &&
      (response.error.message?.includes("domain is not verified") ||
        response.error.statusCode === 403)
    ) {
      console.warn(
        `Custom domain '${from}' is not verified in Resend. Automatically falling back to 'RepoPilot <onboarding@resend.dev>'...`
      );
      emailPayload.from = "RepoPilot <onboarding@resend.dev>";
      response = await resend.emails.send(emailPayload);
    }

    if (response.error) {
      console.error(`Resend API error for ${to}:`, response.error);
      throw new Error(response.error.message || "Failed to send email");
    }

    console.log(`Email successfully sent to ${to}:`, response.data?.id);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
    throw error;
  }
}

// Send an instant notification email to repository owner upon review completion
export async function sendReviewNotificationEmail({
  to,
  repoName,
  prNumber,
  prTitle,
  reviewSnippet,
  reviewUrl,
}: {
  to: string;
  repoName: string;
  prNumber: number;
  prTitle: string;
  reviewSnippet: string;
  reviewUrl?: string;
}) {
  const content = `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <h3 style="margin-top: 0; color: #1e293b; font-size: 16px;">PR #${prNumber}: ${prTitle}</h3>
      <p style="color: #64748b; font-size: 13px; margin-bottom: 12px;">Repository: <strong>${repoName}</strong></p>
      <div style="font-size: 14px; color: #334155; line-height: 1.6; white-space: pre-wrap;">${reviewSnippet.slice(0, 400)}...</div>
    </div>
    <div style="text-align: center; margin-top: 24px;">
      <a href="${reviewUrl || "http://localhost:3000/dashboard/reviews"}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; display: inline-block;">
        View Full AI Review in Dashboard
      </a>
    </div>
  `;

  return await sendMail({
    to,
    subject: `AI Code Review Ready: ${repoName} #${prNumber}`,
    html: wrapEmailTemplate(content, repoName),
  });
}

// Email template wrapper for consistent styling
export function wrapEmailTemplate(content: string, repoName: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RepoPilot Update - ${repoName}</title>
    <style>
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; }
        a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
        @media only screen and (max-width: 600px) {
            .container { width: 100% !important; max-width: 100% !important; }
            .content-padding { padding: 20px !important; }
            .header-text { font-size: 20px !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f8fa; color: #1f2937; font-family: Roboto, 'Helvetica Neue', Arial, sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI'; line-height: 1.6;">

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 10px;">
                <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse; max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.12);">
                    <tr>
                        <td align="center" style="padding: 24px 32px 16px; border-bottom: 3px solid #2563eb;">
                            <span style="font-size: 24px; font-weight: 700; color: #2563eb; line-height: 1; display: block;">
                                RepoPilot AI
                            </span>
                        </td>
                    </tr>
                    
                    <tr>
                        <td class="content-padding" style="padding: 32px;">
                            <h1 class="header-text" style="margin: 0 0 8px; color: #1f2937; font-size: 22px; font-weight: 600;">
                                Report for <span style="color: #2563eb;">${repoName}</span>
                            </h1>
                            <p style="margin: 0 0 24px; color: #6b7280; font-size: 13px;">
                                Automated code analysis and weekly repository intelligence.
                            </p>
                            
                            <div style="font-size: 15px; color: #374151;">
                                ${content}
                            </div>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 0 32px;">
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0;">
                        </td>
                    </tr>

                    <tr>
                        <td class="content-padding" style="padding: 24px 32px 32px;">
                            <p style="margin: 0 0 12px; color: #6b7280; font-size: 13px; text-align: left;">
                                This report is automatically generated by RepoPilot.
                            </p>
                            <p style="margin: 0; color: #9ca3af; font-size: 11px; text-align: left;">
                                &copy; ${new Date().getFullYear()} RepoPilot Team. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `.trim();
}
