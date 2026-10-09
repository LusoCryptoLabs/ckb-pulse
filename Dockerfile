FROM node:22-alpine
# fonts for the share cards: Inter, and WenQuanYi Zen Hei for Chinese
RUN apk add --no-cache font-inter font-wqy-zenhei
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm clean-install --omit=dev
COPY *.mjs ./
COPY public ./public
# the platform mounts a volume at /app/data; owned by node so the server can write its state there
RUN mkdir -p /app/data && chown node:node /app/data
ENV PORT=8080 DATA_DIR=/app/data
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
