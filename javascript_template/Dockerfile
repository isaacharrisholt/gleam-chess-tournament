FROM ghcr.io/gleam-lang/gleam:v1.8.1-node-slim AS builder

WORKDIR /build
COPY . /build

# Compile the project
RUN gleam build --target javascript

FROM denoland/deno:alpine-2.2.2

WORKDIR /app
COPY --from=builder /build/build/dev/javascript /app

RUN echo "main()" >> /app/javascript_template/javascript_template.mjs
CMD ["deno", "--allow-net", "/app/javascript_template/javascript_template.mjs"]
