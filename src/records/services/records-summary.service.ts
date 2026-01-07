import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Record, RecordDocument } from "../schemas/record.schema";
import { UserRole } from "../../users/schemas/user-role.enum";

@Injectable()
export class RecordsSummaryService {
  constructor(
    @InjectModel(Record.name) private readonly recordModel: Model<RecordDocument>
  ) {}

  async getSummary(user: any): Promise<any> {
    const aggregationPipeline: any[] = [];

    if (user.role === UserRole.COLLECTOR) {
      if (!user.userId || !Types.ObjectId.isValid(user.userId)) {
        return [];
      }
      aggregationPipeline.push({
        $match: {
          assignedCollector: new Types.ObjectId(user.userId),
        },
      });
    } else if (user.role === UserRole.PROVIDER) {
      const providerName = (user.fullName || user.username || "").trim();
      if (!providerName) return [];

      const escapedName = providerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      aggregationPipeline.push({
        $match: {
          provider: { $regex: new RegExp(`^\\s*${escapedName}\\s*$`, "i") },
        },
      });
    }

    aggregationPipeline.push({
      $facet: {
        byCaseStatus: [
          {
            $match: {
              provider: { $exists: true, $nin: [null, ""] },
              caseStatus: { $exists: true, $nin: [null, ""] },
            },
          },
          {
            $project: {
              provider: "$provider",
              standardizedStatus: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $regexMatch: {
                          input: "$caseStatus",
                          regex: /c ?& ?r.*granted/i,
                        },
                      },
                      then: "C & R (GRANTED)",
                    },
                    {
                      case: {
                        $regexMatch: {
                          input: "$caseStatus",
                          regex: /cic.*pend/i,
                        },
                      },
                      then: "CIC PENDING",
                    },
                    {
                      case: {
                        $regexMatch: {
                          input: "$caseStatus",
                          regex: /settled/i,
                        },
                      },
                      then: "SETTLED",
                    },
                  ],
                  default: {
                    $cond: [
                      {
                        $regexMatch: { input: "$caseStatus", regex: /settled/i },
                      },
                      "SETTLED",
                      "OTHER",
                    ],
                  },
                },
              },
            },
          },
          {
            $group: {
              _id: {
                provider: "$provider",
                status: "$standardizedStatus",
              },
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              provider: "$_id.provider",
              status: "$_id.status",
              count: "$count",
            },
          },
        ],
        byCommentStatus: [
          {
            $match: {
              provider: { $exists: true, $nin: [null, ""] },
              "comments.status": { $regex: /^out of sol$/i },
            },
          },
          {
            $group: {
              _id: "$provider",
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              provider: "$_id",
              status: "OUT OF SOL",
              count: "$count",
            },
          },
        ],
      },
    });

    aggregationPipeline.push(
      {
        $project: {
          allStatuses: { $concatArrays: ["$byCaseStatus", "$byCommentStatus"] },
        },
      },
      { $unwind: "$allStatuses" },
      {
        $match: {
          "allStatuses.status": {
            $in: ["C & R (GRANTED)", "CIC PENDING", "SETTLED", "OUT OF SOL"],
          },
        },
      },
      {
        $group: {
          _id: "$allStatuses.provider",
          statuses: {
            $push: {
              status: "$allStatuses.status",
              count: "$allStatuses.count",
            },
          },
          totalCount: { $sum: "$allStatuses.count" },
        },
      },
      {
        $project: {
          _id: 0,
          provider: "$_id",
          statuses: 1,
          totalCount: 1,
        },
      },
      { $sort: { provider: 1 } }
    );

    // Keep the "override" logic from original code (safe no-op if structure differs)
    const facetStage = aggregationPipeline.find((stage) => stage.$facet);
    if (facetStage) {
      const projectStage = facetStage.$facet.byCaseStatus.find((stage: any) => stage.$project);
      if (projectStage) {
        projectStage.$project.standardizedStatus = {
          $switch: {
            branches: [
              {
                case: { $regexMatch: { input: "$caseStatus", regex: /c ?& ?r.*granted/i } },
                then: "C & R (GRANTED)",
              },
              {
                case: { $regexMatch: { input: "$caseStatus", regex: /cic.*pend/i } },
                then: "CIC PENDING",
              },
              {
                case: { $regexMatch: { input: "$caseStatus", regex: /settled/i } },
                then: "SETTLED",
              },
            ],
            default: "OTHER",
          },
        };
      }
    }

    return this.recordModel.aggregate(aggregationPipeline);
  }
}
