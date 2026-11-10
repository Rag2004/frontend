FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Vite inlines these at build time (set per desk in docker-compose.mock.yml / docker-compose.broker.yml).
ARG VITE_DESK_PROFILE=
ARG VITE_DEFAULT_BROKER=mock
ARG VITE_BROKER_BOOK_LABEL=
ARG VITE_DESK_ENV=
ARG VITE_BASE_PATH=/
ENV VITE_DESK_PROFILE=$VITE_DESK_PROFILE
ENV VITE_DEFAULT_BROKER=$VITE_DEFAULT_BROKER
ENV VITE_BROKER_BOOK_LABEL=$VITE_BROKER_BOOK_LABEL
ENV VITE_DESK_ENV=$VITE_DESK_ENV
ENV VITE_BASE_PATH=$VITE_BASE_PATH

RUN npm run build

FROM nginx:1.27-alpine
# mock desk: nginx.mock.conf (/toe/ only). Broker desk: nginx.broker.conf (/toe-dhan/ only).
# Selected file is rendered at start from UPSTREAM_* (see docker/docker-entrypoint.sh).
ARG NGINX_CONF=nginx.conf
ENV NGINX_ENVSUBST_FILTER=^UPSTREAM_
COPY --from=build /app/dist /usr/share/nginx/html
COPY ${NGINX_CONF} /etc/nginx/templates/default.conf.template
COPY docker/docker-entrypoint.sh /usr/local/bin/dashboard-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/dashboard-entrypoint.sh && chmod +x /usr/local/bin/dashboard-entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/usr/local/bin/dashboard-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
