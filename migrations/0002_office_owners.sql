-- One office per account; a legacy office can only be claimed once.
CREATE TABLE office_owner (
  userId TEXT NOT NULL PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
  officeId TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL
);
