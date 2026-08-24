import { Schema, model } from "mongoose";

/**
 * A pending verification code. Stored as a sub-document so it can be cleared
 * (set to null) in one update once the email is verified.
 */
const otpSchema = new Schema(
  {
    codeHash: { type: String, required: true }, // HMAC of the code, never plaintext
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date }, // used to enforce the resend cooldown
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    // scrypt:<salt>:<hash> — social-only accounts get an unusable random value
    passwordHash: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    otp: { type: otpSchema, default: null },
  },
  { timestamps: true },
);

export const User = model("User", userSchema);

// Handy inferred types for typed queries without hand-writing interfaces.
export type UserDocument = import("mongoose").InferSchemaType<typeof userSchema>;
export type UserInstance = import("mongoose").HydratedDocument<UserDocument> & {
  _id: import("mongoose").Types.ObjectId;
};
