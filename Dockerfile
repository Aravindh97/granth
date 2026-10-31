FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/granth ./cmd/granth

FROM debian:bookworm-slim
# poppler-utils + tesseract for the OCR fallback on scanned PDFs
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates poppler-utils tesseract-ocr tesseract-ocr-hin tesseract-ocr-tam \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 granth
USER granth
COPY --from=build /out/granth /usr/local/bin/granth
ENTRYPOINT ["granth"]
CMD ["worker"]
