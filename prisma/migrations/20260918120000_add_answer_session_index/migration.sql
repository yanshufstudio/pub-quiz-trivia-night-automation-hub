-- CreateIndex
CREATE INDEX "Answer_sessionId_roundIndex_questionIndex_idx" ON "Answer"("sessionId", "roundIndex", "questionIndex");
