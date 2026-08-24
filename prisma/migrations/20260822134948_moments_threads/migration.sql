-- CreateTable
CREATE TABLE "Moment" (
    "id" SERIAL NOT NULL,
    "learnerId" BIGINT NOT NULL,
    "text" TEXT NOT NULL,
    "feeling" TEXT NOT NULL DEFAULT '',
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Moment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" SERIAL NOT NULL,
    "learnerId" BIGINT NOT NULL,
    "text" TEXT NOT NULL,
    "askAfter" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Moment_learnerId_id_idx" ON "Moment"("learnerId", "id");

-- CreateIndex
CREATE INDEX "Thread_learnerId_closedAt_askAfter_idx" ON "Thread"("learnerId", "closedAt", "askAfter");

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
