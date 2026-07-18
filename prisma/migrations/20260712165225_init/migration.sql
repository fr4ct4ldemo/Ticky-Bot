-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "themeColor" INTEGER NOT NULL DEFAULT 5814783,
    "footerText" TEXT,
    "footerIconUrl" TEXT,
    "thumbnailUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Panel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "embedColor" INTEGER NOT NULL DEFAULT 5814783,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Panel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("guildId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "staffTeamId" TEXT,
    "embedColor" INTEGER NOT NULL DEFAULT 5814783,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Category_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("guildId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Category_staffTeamId_fkey" FOREIGN KEY ("staffTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleIds" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("guildId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "categoryId" TEXT,
    "openerId" TEXT NOT NULL,
    "staffUserId" TEXT,
    "channelId" TEXT,
    "threadId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ticket_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("guildId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketParticipant_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tag_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("guildId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "categoryId" TEXT,
    "prompt" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Question_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("guildId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Question_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transcript_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("guildId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transcript_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeedbackRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackRating_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("guildId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedbackRating_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Blacklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Blacklist_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("guildId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InactivityState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "categoryId" TEXT,
    "warningSentAt" DATETIME,
    "autoCloseAt" DATETIME,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InactivityState_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("guildId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InactivityState_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InactivityState_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Guild_guildId_key" ON "Guild"("guildId");

-- CreateIndex
CREATE INDEX "Panel_guildId_idx" ON "Panel"("guildId");

-- CreateIndex
CREATE INDEX "Category_guildId_idx" ON "Category"("guildId");

-- CreateIndex
CREATE INDEX "Team_guildId_idx" ON "Team"("guildId");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");

-- CreateIndex
CREATE INDEX "Ticket_guildId_idx" ON "Ticket"("guildId");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "TicketParticipant_ticketId_idx" ON "TicketParticipant"("ticketId");

-- CreateIndex
CREATE INDEX "TicketParticipant_userId_idx" ON "TicketParticipant"("userId");

-- CreateIndex
CREATE INDEX "Tag_guildId_idx" ON "Tag"("guildId");

-- CreateIndex
CREATE INDEX "Question_guildId_idx" ON "Question"("guildId");

-- CreateIndex
CREATE INDEX "QuestionResponse_ticketId_idx" ON "QuestionResponse"("ticketId");

-- CreateIndex
CREATE INDEX "Transcript_guildId_idx" ON "Transcript"("guildId");

-- CreateIndex
CREATE INDEX "Transcript_ticketId_idx" ON "Transcript"("ticketId");

-- CreateIndex
CREATE INDEX "FeedbackRating_guildId_idx" ON "FeedbackRating"("guildId");

-- CreateIndex
CREATE INDEX "Blacklist_guildId_idx" ON "Blacklist"("guildId");

-- CreateIndex
CREATE INDEX "InactivityState_guildId_idx" ON "InactivityState"("guildId");

-- CreateIndex
CREATE INDEX "InactivityState_ticketId_idx" ON "InactivityState"("ticketId");
