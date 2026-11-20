import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "user",
  "moderator",
  "admin",
  "super_admin",
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "muted",
  "suspended",
  "banned",
]);

export const authProviderEnum = pgEnum("auth_provider", ["google", "telegram"]);

export const authChannelEnum = pgEnum("auth_channel", [
  "web_cookie",
  "tma_bearer",
]);

export const themePreferenceEnum = pgEnum("theme_preference", [
  "system",
  "light",
  "dark",
]);

export const privacyLevelEnum = pgEnum("privacy_level", [
  "public",
  "private",
  "followers_only",
]);

export const postTypeEnum = pgEnum("post_type", [
  "note",
  "poem",
  "quote",
  "thought",
  "story",
]);

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type UserStatus = (typeof userStatusEnum.enumValues)[number];
export type AuthProvider = (typeof authProviderEnum.enumValues)[number];
export type AuthChannel = (typeof authChannelEnum.enumValues)[number];
export type ThemePreference = (typeof themePreferenceEnum.enumValues)[number];
export type PrivacyLevel = (typeof privacyLevelEnum.enumValues)[number];
export type PostType = (typeof postTypeEnum.enumValues)[number];
