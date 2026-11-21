FROM node:22

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Only non-secret values that Next.js may embed in the build are build arguments.
ARG BETTER_AUTH_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID=
ARG RAZORPAY_PRO_AMOUNT=14900
ARG RAZORPAY_CURRENCY=INR

# Build-time placeholders satisfy Prisma and Better Auth without baking
# runtime credentials into the image.
RUN export DATABASE_URL=postgresql://localhost:5432/aicodereview && \
    export BETTER_AUTH_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" && \
    export GITHUB_CLIENT_ID=build-only-placeholder && \
    export GITHUB_CLIENT_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" && \
    npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
