FROM node:20-alpine

# Install FFmpeg
RUN apk add --no-cache \
    ffmpeg \
    fontconfig \
    ttf-dejavu

WORKDIR /app

COPY . .

ENV NODE_ENV=production

EXPOSE 4455

CMD ["node", "server/index.js"]
