CREATE TABLE "SavedRoom" (
    "code" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedRoom_pkey" PRIMARY KEY ("code")
);
