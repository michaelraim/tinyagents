CREATE TABLE device_pairing (
  deviceHash TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  timeZone TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  userId TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  officeId TEXT,
  connectedAt INTEGER
);
CREATE INDEX device_pairing_expiry ON device_pairing(expiresAt);
