import mongoose from "mongoose";
import bcrypt from "bcrypt";

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

// helper to set password
UserSchema.methods.setPassword = async function (password) {
  this.passwordHash = await bcrypt.hash(password, 10);
};

// helper to compare password
UserSchema.methods.validatePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

export default mongoose.model("User", UserSchema);
