import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull().default("Explorateur"),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});

export const exploredCircles = sqliteTable("explored_circles", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  radiusM: integer("radius_m").notNull().default(50),
  exploredAt: integer("explored_at").notNull(),
}, (table) => [index("idx_explored_circles_device_time").on(table.deviceId, table.exploredAt)]);

export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  city: text("city").notNull(),
  startedAt: integer("started_at").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  distanceM: real("distance_m").notNull(),
  circlesCount: integer("circles_count").notNull(),
  pointsJson: text("points_json").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("idx_trips_device_started").on(table.deviceId, table.startedAt)]);

export const cityCards = sqliteTable("city_cards", {
  id: text("id").primaryKey(),
  city: text("city").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull().default("✦"),
  tone: text("tone").notNull().default("green"),
  imageKey: text("image_key"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  unlockRadiusM: integer("unlock_radius_m").notNull().default(50),
  challengeDistanceM: integer("challenge_distance_m"),
  qrCode: text("qr_code"),
  status: text("status", { enum: ["proposed", "approved", "rejected"] }).notNull().default("proposed"),
  authorDeviceId: text("author_device_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_city_cards_city_status").on(table.city, table.status),
  uniqueIndex("idx_city_cards_qr_code").on(table.qrCode),
]);

export const cardVotes = sqliteTable("card_votes", {
  cardId: text("card_id").notNull().references(() => cityCards.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.cardId, table.deviceId] }), index("idx_card_votes_card").on(table.cardId)]);

export const collectedCards = sqliteTable("collected_cards", {
  cardId: text("card_id").notNull().references(() => cityCards.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  method: text("method", { enum: ["gps", "qr", "challenge"] }).notNull(),
  collectedAt: integer("collected_at").notNull(),
}, (table) => [primaryKey({ columns: [table.cardId, table.deviceId] }), index("idx_collected_cards_device").on(table.deviceId)]);
