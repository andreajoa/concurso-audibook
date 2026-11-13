# syntax=docker/dockerfile:1
# NexaCloud build (GitHub Actions). Runs the Vercel-style site (public/ + api/*.js + vercel.json)
# with the NexaCloud functions adapter. Production variables arrive as the build secret "ncenv".
FROM node:22-slim
WORKDIR /app
COPY . .
ARG NC_ENV_HASH
RUN --mount=type=secret,id=ncenv sh -c 'set -a; [ -f /run/secrets/ncenv ] && . /run/secrets/ncenv; set +a; npm ci && npm run build'
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "ops/nexacloud/vercel-adapter.mjs"]
