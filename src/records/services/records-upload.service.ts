import { Injectable, BadRequestException } from "@nestjs/common";
import * as XLSX from "xlsx";
import { CreateRecordDto } from "../dto/create-record.dto";
import { RecordWriterService } from "./record-writer.service";

@Injectable()
export class RecordsUploadService {
  constructor(private readonly writer: RecordWriterService) {}

  async processUpload(
    buffer: Buffer,
    collectorId?: string,
    actor?: any
  ): Promise<{ count: number; failedRecords: any[] }> {
    let workbook: XLSX.WorkBook;

    try {
      workbook = XLSX.read(buffer, { type: "buffer" });
    } catch (err) {
      try {
        const str = buffer.toString("utf8");
        workbook = XLSX.read(str, { type: "string" });
      } catch (err2) {
        throw new BadRequestException("Unsupported file format");
      }
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const data: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: null,
    });

    if (data.length === 0) {
      return { count: 0, failedRecords: [] };
    }

    const parseCurrency = (value: any): number | null => {
      if (value === null || value === undefined || value === "") return null;
      if (typeof value === "number") return value;

      let cleanStr = String(value);
      const isNegativeInParens =
        cleanStr.startsWith("(") && cleanStr.endsWith(")");

      cleanStr = cleanStr.replace(/[$,€£¥\s()]/g, "");
      const num = parseFloat(cleanStr);

      if (isNaN(num)) return null;
      return isNegativeInParens ? -num : num;
    };

    const normalizeCaseStatus = (value: any): string => {
      if (typeof value !== "string" || !value) return "";
      const allowed = [
        "SETTLED",
        "C & R (GRANTED)",
        "CIC PENDING",
        "A & S GRANTED",
        "ADR CASE - SETTED AND PAID ADR",
        "ORDER OF DISMISAAL OF CASE",
        "",
      ];

      const match = allowed.find(
        (a) => a.toLowerCase() === value.trim().toLowerCase()
      );

      return match || value;
    };

    const headers = data[0].map((h: string) =>
      h ? h.trim().replace(/\s+/g, "") : ""
    );

    const records: CreateRecordDto[] = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row.length === 0) continue;

      const record: any = { claimNo: [], adjNumber: [], doi: [] };

      for (let j = 0; j < headers.length; j++) {
        const value = row[j];
        if (value === null) continue;

        const header = headers[j].toLowerCase();

        if (header === "provider") record.provider = value;
        else if (header === "renderingfacility") record.renderingFacility = value;
        else if (header === "taxid") record.taxId = value;
        else if (header === "ptname") record.ptName = value;
        else if (header === "dob") record.dob = value;
        else if (header === "ssn") record.ssn = value;
        else if (header === "employer") record.employer = value;
        else if (header === "insurance") record.insurance = value;
        else if (header === "bill") record.bill = parseCurrency(value);
        else if (header === "paid") record.paid = parseCurrency(value);
        else if (header === "outstanding") record.outstanding = parseCurrency(value);
        else if (header === "fds") record.fds = value;
        else if (header === "lds") record.lds = value;
        else if (header === "ledger") record.ledger = value;
        else if (header === "hcf") record.hcf = value;
        else if (header === "invoice") record.invoice = value;
        else if (header === "signinsheet") record.signinSheet = value;
        else if (header === "soldate") record.solDate = value;
        else if (header === "hearingstatus") record.hearingStatus = value;
        else if (header === "hearingdate") record.hearingDate = value;
        else if (header === "hearingtime") record.hearingTime = value;
        else if (header === "judgename") record.judgeName = value;
        else if (header === "courtroomlink") record.courtRoomlink = value;
        else if (header === "judgephone") record.judgePhone = value;
        else if (header === "accescode") record.AccesCode = value;
        else if (header === "boardlocation") record.boardLocation = value;
        else if (header === "lienstatus") record.lienStatus = value;
        else if (header === "casestatus") record.caseStatus = normalizeCaseStatus(value);
        else if (header === "casedate") record.caseDate = value;
        else if (header === "cramount") record.crAmount = parseCurrency(value);
        else if (header === "dorfiledby") record.dorFiledBy = value;
        else if (header === "status4903_8") record.status4903_8 = value;
        else if (header === "pmrstatus") record.pmrStatus = value;
        else if (header === "judgeorderstatus") record.judgeOrderStatus = value;
        else if (header === "adjuster") record.adjuster = value;
        else if (header === "adjusterphone") record.adjusterPhone = value;
        else if (header === "adjusterfax") record.adjusterFax = value;
        else if (header === "adjusteremail") record.adjusterEmail = value;
        else if (header === "defenseattorney") record.defenseAttorney = value;
        else if (header === "defenseattorneyphone") record.defenseAttorneyPhone = value;
        else if (header === "defenseattorneyfax") record.defenseAttorneyFax = value;
        else if (header === "defenseattorneyemail") record.defenseAttorneyEmail = value;
        else if (header.startsWith("claimno.")) {
          const index = parseInt(header.split(".")[1]) - 1;
          if (value) record.claimNo[index] = { value };
        } else if (header.startsWith("adjnumber.")) {
          const index = parseInt(header.split(".")[1]) - 1;
          if (value) record.adjNumber[index] = { value };
        } else if (header.startsWith("doi.")) {
          const index = parseInt(header.split(".")[1]) - 1;
          if (value) record.doi[index] = { value };
        }
      }

      record.claimNo = record.claimNo.filter((item) => item !== undefined);
      record.adjNumber = record.adjNumber.filter((item) => item !== undefined);
      record.doi = record.doi.filter((item) => item !== undefined);

      if (record.outstanding === undefined || record.outstanding === null) {
        if (
          record.bill !== undefined &&
          record.paid !== undefined &&
          record.bill !== null &&
          record.paid !== null
        ) {
          record.outstanding = record.bill - record.paid;
        } else if (record.bill !== undefined && record.bill !== null) {
          record.outstanding = record.bill;
        }
      }

      if (record.ptName) {
        if (collectorId) {
          record.assignedCollector = collectorId;
          record.assignedAt = new Date();
        }
        records.push(record);
      }
    }

    let count = 0;
    const failedRecords: any[] = [];

    for (const rec of records) {
      try {
        await this.writer.create(rec as any, actor);
        count++;
      } catch (err: any) {
        failedRecords.push({
          ...rec,
          errorReason: err?.message || "Unknown error",
        });
      }
    }

    return { count, failedRecords };
  }
}
