-- CreateTable
CREATE TABLE "Learner" (
    "id" BIGINT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'casual',
    "pingsPerDay" INTEGER NOT NULL DEFAULT 2,
    "nextPingAt" TIMESTAMP(3),
    "expiry" TIMESTAMP(3),
    "profileMd" TEXT NOT NULL DEFAULT '',
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastActive" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Learner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vocab" (
    "id" SERIAL NOT NULL,
    "learnerId" BIGINT NOT NULL,
    "word" TEXT NOT NULL,
    "pinyin" TEXT NOT NULL,
    "gloss" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT 'general',
    "strength" INTEGER NOT NULL DEFAULT 1,
    "introduced" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vocab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "learnerId" BIGINT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Code" (
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedBy" BIGINT,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Code_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "WebSession" (
    "token" TEXT NOT NULL,
    "learnerId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WebSession_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "Vocab_learnerId_strength_lastSeen_idx" ON "Vocab"("learnerId", "strength", "lastSeen");

-- CreateIndex
CREATE UNIQUE INDEX "Vocab_learnerId_word_key" ON "Vocab"("learnerId", "word");

-- CreateIndex
CREATE INDEX "Message_learnerId_id_idx" ON "Message"("learnerId", "id");

-- AddForeignKey
ALTER TABLE "Vocab" ADD CONSTRAINT "Vocab_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebSession" ADD CONSTRAINT "WebSession_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
