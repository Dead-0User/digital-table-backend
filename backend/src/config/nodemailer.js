const nodemailer = require("nodemailer");

/**
 * Create reusable transporter for sending emails
 * Uses Gmail SMTP (you can change to any email provider)
 */
const transporter = nodemailer.createTransport({
  service: "gmail", // You can use 'hotmail', 'yahoo', etc.
  auth: {
    user: process.env.EMAIL_USER, // Your email (e.g., yourapp@gmail.com)
    pass: process.env.EMAIL_PASS, // App password (NOT your regular password)
  },
});

/**
 * Send OTP Email
 * @param {string} to - Recipient email
 * @param {string} otp - 6-digit OTP
 * @param {string} restaurantName - Restaurant name for personalization
 */
const sendOTPEmail = async (to, otp, restaurantName) => {
  const mailOptions = {
    from: `"QRMenu Support" <${process.env.EMAIL_USER}>`,
    to: to,
    subject: "Password Reset OTP - QRMenu",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                   color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-box { background: white; border: 2px dashed #667eea; padding: 20px; 
                    text-align: center; font-size: 32px; font-weight: bold; 
                    letter-spacing: 8px; color: #667eea; margin: 20px 0; border-radius: 8px; }
          .warning { color: #e53e3e; font-size: 14px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hi <strong>${restaurantName}</strong>,</p>
            <p>We received a request to reset your password. Use the OTP below to proceed:</p>
            
            <div class="otp-box">${otp}</div>
            
            <p><strong>This OTP will expire in 5 minutes.</strong></p>
            
            <p>If you didn't request this, please ignore this email. Your password will remain secure.</p>
            
            <div class="warning">
              ⚠️ Never share this OTP with anyone. QRMenu staff will never ask for your OTP.
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} QRMenu. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error("❌ Email sending failed:", error);
    return { success: false, error: error.message };
  }
};

const sendStaffCredentials = async (to, { username, password, restaurantName, role, restaurantId }) => {
  const mailOptions = {
    from: `"QRMenu Support" <${process.env.EMAIL_USER}>`,
    to: to,
    subject: "Your Staff Account Credentials - QRMenu",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                   color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .credential-box { background: white; border-left: 4px solid #667eea; padding: 20px; 
                           margin: 20px 0; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
          .credential-item { margin-bottom: 10px; }
          .label { font-weight: bold; color: #555; width: 100px; display: inline-block; }
          .value { font-family: monospace; font-size: 16px; color: #333; background: #eee; 
                   padding: 2px 6px; border-radius: 4px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>👋 Welcome to the Team!</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>You have been added as a staff member at <strong>${restaurantName}</strong>.</p>
            <p>Here are your login credentials:</p>
            
            <div class="credential-box">
              <div class="credential-item">
                <span class="label">Restaurant:</span>
                <span class="value">${restaurantName}</span>
              </div>
              <div class="credential-item">
                <span class="label">Rest. ID:</span>
                <span class="value">${restaurantId}</span>
              </div>
              <div class="credential-item">
                <span class="label">Role:</span>
                <span class="value" style="text-transform: capitalize;">${role}</span>
              </div>
              <br/>
              <div class="credential-item">
                <span class="label">Username:</span>
                <span class="value">${username}</span>
              </div>
               <div class="credential-item">
                <span class="label">Password:</span>
                <span class="value">${password}</span>
              </div>
            </div>
            
            <p>Please login and change your password upon your first access.</p>
            
            <div class="footer">
              <p>© ${new Date().getFullYear()} QRMenu. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Staff credentials email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error("❌ Email sending failed:", error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendOTPEmail, sendStaffCredentials };