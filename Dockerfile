FROM node:22-alpine
WORKDIR /app
COPY package.json *.mjs ./
COPY public ./public
# the platform mounts a volume at /app/data; owned by node so the server can write its state there
RUN mkdir -p /app/data && chown node:node /app/data
ENV PORT=8080 DATA_DIR=/app/data
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
