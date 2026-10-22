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
  from = process.env.EMAIL_FROM || "noreply@notifications.repopilot.team",
  cc,
}: SendMailOptions) { 
  try {
    const emailPayload: any = {
      from,
      to,
      subject,
      html,
    };

    if (cc) {
      emailPayload.cc = cc;
    }

    const data = await resend.emails.send(emailPayload);
    return { success: true, data };
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
    throw error;
  }
}

// Email template wrapper for consistent styling
export function wrapEmailTemplate(content: string, repoName: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weekly Update - ${repoName}</title>
    <style>
        /* CSS Reset for better email client compatibility */
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; }
        a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
        
        /* Mobile styles (optional, but highly recommended) */
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
                        <td align="center" style="padding: 24px 32px 16px; border-bottom: 3px solid #4285f4;">
                            <span style="font-size: 24px; font-weight: 500; color: #4285f4; line-height: 1; display: block;">
                                Project Updates
                            </span>
                        </td>
                    </tr>
                    
                    <tr>
                        <td class="content-padding" style="padding: 32px;">
                            
                            <h1 class="header-text" style="margin: 0 0 8px; color: #1f2937; font-size: 24px; font-weight: 500;">
                                Weekly Report: <span style="color: #4285f4;">${repoName}</span>
                            </h1>
                            <p style="margin: 0 0 24px; color: #6b7280; font-size: 14px;">
                                A summary of the last week's progress, activity, and key metrics.
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
                                This report is automatically generated. For feedback or support, visit our <a href="#" style="color: #4285f4; text-decoration: none;">Help Center</a>.
                            </p>

                            <p style="margin: 0; color: #9ca3af; font-size: 11px; text-align: left;">
                                &copy; ${new Date().getFullYear()} RepoPilot Team. All rights reserved. <a href="https://repopilot.team" style="color: #9ca3af; text-decoration: underline;">Privacy Policy</a> | <a href="#" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a>
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
