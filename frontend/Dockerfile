FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# nginx's entrypoint substitutes ${API_UPSTREAM} into the template at startup.
ENV API_UPSTREAM=http://host.docker.internal:4000
ENV NGINX_ENVSUBST_FILTER=API_UPSTREAM
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
