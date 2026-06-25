/**
 * Passport setup: Google OAuth2 strategy + session serialization.
 *
 * The Google verify callback is where account LINKING happens. Rules (per spec):
 *   1. Known google_sub      -> log in that account (returning Google user).
 *   2. Verified Google email matches an existing account -> link google_sub onto
 *      it and log in (works whether or not it had a password).
 *   3. No match -> silently create a passwordless, email-verified account.
 *   4. Google email NOT verified -> refuse to link by email (anti-takeover).
 *
 * CSRF on the OAuth round-trip is handled by `state: true` (state stored in the
 * session and checked on callback).
 */
import passport from "passport";
import {
  Strategy as GoogleStrategy,
  type Profile,
  type VerifyCallback,
} from "passport-google-oauth20";
import { config } from "../config";
import {
  createGoogleUser,
  findByEmail,
  findByGoogleSub,
  findById,
  linkGoogleSub,
  type User,
} from "../db/users";

/** Distinguishable error so routes can show a friendly message. */
export class GoogleEmailUnverifiedError extends Error {
  constructor() {
    super("GOOGLE_EMAIL_UNVERIFIED");
    this.name = "GoogleEmailUnverifiedError";
  }
}

async function handleGoogleProfile(profile: Profile): Promise<User> {
  const googleSub = profile.id;

  // 1. Returning Google user.
  const bySub = await findByGoogleSub(googleSub);
  if (bySub) return bySub;

  // Use the authoritative claims from the verified ID token payload.
  const email = profile._json.email?.toLowerCase();
  const emailVerified = profile._json.email_verified === true;

  if (!email || !emailVerified) {
    // 4. Never link/create by an unverified Google email.
    throw new GoogleEmailUnverifiedError();
  }

  // 2. Link onto an existing account with the same email.
  const byEmail = await findByEmail(email);
  if (byEmail) return linkGoogleSub(byEmail.id, googleSub);

  // 3. Brand-new passwordless account.
  return createGoogleUser(email, googleSub);
}

export function configurePassport(): void {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL: config.GOOGLE_CALLBACK_URL,
        scope: ["openid", "email", "profile"],
        // Session-backed `state` param: CSRF protection for the OAuth round-trip.
        state: true,
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: VerifyCallback
      ) => {
        try {
          const user = await handleGoogleProfile(profile);
          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );

  // Only the user id goes into the session; the rest is loaded per request.
  passport.serializeUser((user, done) => {
    done(null, (user as User).id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await findById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err as Error);
    }
  });
}

export { passport };
