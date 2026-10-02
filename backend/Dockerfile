# One image for both the API and the worker (different commands).
FROM node:22-alpine
WORKDIR /app
# The in-memory MongoDB binary is only needed for tests/dev.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["npm", "start"]
