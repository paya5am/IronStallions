// Extra hostnames (for example the laptop's Wi-Fi address, so a phone can open
// the app during the QR demo) come from ALLOWED_DEV_ORIGINS in .env.local.
const allowed = (process.env.ALLOWED_DEV_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mysql2'],
  allowedDevOrigins: allowed,
};

export default nextConfig;
