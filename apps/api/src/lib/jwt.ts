import { jwtVerify, SignJWT } from "jose";

export interface AccessTokenClaims {
  email: string;
  sub: string; // user id
}

interface JwtPayload extends AccessTokenClaims {
  exp: number;
  iat: number;
}

const ALG = "HS256";
const ACCESS_TTL = "15m"; // PRD §9.1
const ISSUER = "chat";

function getKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function signAccessToken(
  claims: AccessTokenClaims,
  secret: string
): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(getKey(secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string
): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getKey(secret), {
    issuer: ISSUER,
    algorithms: [ALG],
  });
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Invalid token payload");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    iat: payload.iat ?? 0,
    exp: payload.exp ?? 0,
  };
}
