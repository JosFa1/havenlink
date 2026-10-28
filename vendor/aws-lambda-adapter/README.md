# AWS Lambda Web Adapter (vendored)

`lambda-adapter` is the linux/arm64 binary from
`public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1`
(index `sha256:46d6625e68cbbdd2efab4a20245977664513f13ffef47915b000d431adcea0b4`,
arm64 layer `sha256:005f58d84fe7e9addbea4eb25aadb24964a1f903ddb2d011ef92012606ae3f25`),
the same image the deploy used to pull. `Dockerfile.lambda` copies it to
`/opt/extensions/lambda-adapter`.

It is checked in because GitHub runners pull from public.ecr.aws anonymously, and
the shared runner IPs run out of its monthly per-IP data allowance, so builds failed
with `429 Too Many Requests: Data limit exceeded` (deploy 4.1). Docker Hub's
`awsguru/aws-lambda-adapter` stopped at 0.8.x, so there is no second registry to
fall back on.

- sha256 of `lambda-adapter`: `6f8f117f4bad0c731cc818bff08d6baa173779a31a4e15b9f5afd6e184cf5803`
- Source: https://github.com/awslabs/aws-lambda-web-adapter (tag `v0.9.1`), Apache-2.0;
  `LICENSE` and `NOTICE` here are copied from that tag.

To upgrade, pull the new tag's arm64 image, copy `/lambda-adapter` out of it over
this file, and update the version, digests and checksum above.
