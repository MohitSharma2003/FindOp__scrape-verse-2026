import { Schema, model } from "mongoose";

const otpSchema = new Schema(
  {
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date },
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
    passwordHash: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    otp: { type: otpSchema, default: null },
  },
  { timestamps: true },
);

export const User = model("User", userSchema);

export type UserDocument = import("mongoose").InferSchemaType<typeof userSchema>;
export type UserInstance = import("mongoose").HydratedDocument<UserDocument> & {
  _id: import("mongoose").Types.ObjectId;
};
