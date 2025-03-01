FROM ghcr.io/gleam-lang/gleam:v1.8.1-erlang-alpine AS builder

WORKDIR /build
COPY . /build

RUN gleam export erlang-shipment

FROM erlang:alpine

WORKDIR /app
COPY --from=builder /build/build/erlang-shipment .

ENTRYPOINT [ "./entrypoint.sh", "run" ]
