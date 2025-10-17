"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordSchema = exports.Record = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("../../users/schemas/user.schema");
let MultiEntry = class MultiEntry {
};
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], MultiEntry.prototype, "value", void 0);
MultiEntry = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], MultiEntry);
const MultiEntrySchema = mongoose_1.SchemaFactory.createForClass(MultiEntry);
let Comment = class Comment {
};
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Comment.prototype, "text", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        required: true,
        enum: ['callback', 'lvm', 'spoke_to', 'sent_email_fax', 'offer', 'settle', 'wfp', 'payment_received', 'closed']
    }),
    __metadata("design:type", String)
], Comment.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", user_schema_1.User)
], Comment.prototype, "author", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Comment.prototype, "scheduledDate", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Comment.prototype, "scheduledTime", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], Comment.prototype, "isCompleted", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Comment.prototype, "completedAt", void 0);
Comment = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Comment);
const CommentSchema = mongoose_1.SchemaFactory.createForClass(Comment);
let Record = class Record {
};
exports.Record = Record;
__decorate([
    (0, mongoose_1.Prop)({ required: true, index: true, immutable: true }),
    __metadata("design:type", String)
], Record.prototype, "provider", void 0);
__decorate([
    (0, mongoose_1.Prop)({ immutable: true }),
    __metadata("design:type", String)
], Record.prototype, "renderingFacility", void 0);
__decorate([
    (0, mongoose_1.Prop)({ immutable: true }),
    __metadata("design:type", String)
], Record.prototype, "taxId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, index: true, immutable: true }),
    __metadata("design:type", String)
], Record.prototype, "ptName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ immutable: true }),
    __metadata("design:type", Date)
], Record.prototype, "dob", void 0);
__decorate([
    (0, mongoose_1.Prop)({ immutable: true }),
    __metadata("design:type", String)
], Record.prototype, "ssn", void 0);
__decorate([
    (0, mongoose_1.Prop)({ immutable: true }),
    __metadata("design:type", String)
], Record.prototype, "employer", void 0);
__decorate([
    (0, mongoose_1.Prop)({ immutable: true }),
    __metadata("design:type", String)
], Record.prototype, "insurance", void 0);
__decorate([
    (0, mongoose_1.Prop)({ immutable: true }),
    __metadata("design:type", Number)
], Record.prototype, "bill", void 0);
__decorate([
    (0, mongoose_1.Prop)({ immutable: true }),
    __metadata("design:type", Date)
], Record.prototype, "fds", void 0);
__decorate([
    (0, mongoose_1.Prop)({ immutable: true }),
    __metadata("design:type", Date)
], Record.prototype, "lds", void 0);
__decorate([
    (0, mongoose_1.Prop)({ immutable: true }),
    __metadata("design:type", Date)
], Record.prototype, "solDate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [MultiEntrySchema], default: [] }),
    __metadata("design:type", Array)
], Record.prototype, "claimNo", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [MultiEntrySchema], default: [] }),
    __metadata("design:type", Array)
], Record.prototype, "adjNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [MultiEntrySchema], default: [] }),
    __metadata("design:type", Array)
], Record.prototype, "doi", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "hearingStatus", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Record.prototype, "hearingDate", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "hearingTime", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "judgeName", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "courtRoomlink", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "judgePhone", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "AccesCode", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "boardLocation", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "lienStatus", void 0);
__decorate([
    (0, mongoose_1.Prop)({ index: true }),
    __metadata("design:type", String)
], Record.prototype, "caseStatus", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Record.prototype, "caseDate", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], Record.prototype, "crAmount", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "adjuster", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "adjusterPhone", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "adjusterFax", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "adjusterEmail", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "defenseAttorney", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "defenseAttorneyPhone", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "defenseAttorneyFax", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Record.prototype, "defenseAttorneyEmail", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [CommentSchema], default: [] }),
    __metadata("design:type", Array)
], Record.prototype, "comments", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', index: true }),
    __metadata("design:type", user_schema_1.User)
], Record.prototype, "assignedCollector", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now, immutable: true }),
    __metadata("design:type", Date)
], Record.prototype, "recordCreatedAt", void 0);
exports.Record = Record = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Record);
exports.RecordSchema = mongoose_1.SchemaFactory.createForClass(Record);
//# sourceMappingURL=record.schema.js.map