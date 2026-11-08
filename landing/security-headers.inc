# Security headers for locations that set their own add_header.
# Nginx drops server-level add_header in that case, so negotiated HTML and
# markdown responses include this file. Keep the CSP line identical to the
# server block in landing/smartsht.nginx.conf.
add_header X-Frame-Options SAMEORIGIN always;
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://static.cloudflareinsights.com https://*.clerk.accounts.dev https://clerk.smartsht.com https://challenges.cloudflare.com https://*.protect.clerk.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://img.clerk.com https://launchbison.com; connect-src 'self' https://*.clerk.accounts.dev https://clerk.smartsht.com https://api.clerk.com https://clerk-telemetry.com https://*.clerk-telemetry.com https://*.protect.clerk.com https://challenges.cloudflare.com https://openrouter.ai https://api.groq.com https://router.huggingface.co; frame-src https://*.clerk.accounts.dev https://clerk.smartsht.com https://challenges.cloudflare.com https://*.protect.clerk.com; worker-src 'self' blob:;" always;
