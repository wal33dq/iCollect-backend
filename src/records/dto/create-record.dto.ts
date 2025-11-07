import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
  IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class MultiEntryDto {
  @ApiProperty({ description: 'Value for multi-entry field' })
  @IsString()
  value: string;
}

export class CreateRecordDto {
  @ApiProperty({ description: 'Provider name' })
  @IsString()
  @IsNotEmpty()
  provider: string;

  @ApiProperty({ description: 'Rendering facility' })
  @IsOptional()
  @IsString()
  renderingFacility?: string;

  @ApiProperty({ description: 'Tax ID' })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiProperty({ description: 'Patient name' })
  @IsString()
  @IsNotEmpty()
  ptName: string;

  @ApiProperty({ description: 'Date of birth' })
  @IsOptional()
  @IsDateString()
  dob?: Date;

  @ApiProperty({ description: 'SSN' })
  @IsOptional()
  @IsString()
  ssn?: string;

  @ApiProperty({ description: 'Employer' })
  @IsOptional()
  @IsString()
  employer?: string;

  @ApiProperty({ description: 'Date of injury (array of entries)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MultiEntryDto)
  doi?: MultiEntryDto[];

  @ApiProperty({ description: 'Adjuster number (array of entries)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MultiEntryDto)
  adjNumber?: MultiEntryDto[];

  @ApiProperty({ description: 'Bill amount' })
  @IsOptional()
  @IsNumber()
  bill?: number;

  @ApiProperty({ description: 'Paid amount' })
  @IsOptional()
  @IsNumber()
  paid?: number;

  @ApiProperty({ description: 'Outstanding amount' })
  @IsOptional()
  @IsNumber()
  outstanding?: number;

  @ApiProperty({ description: 'First date of service' })
  @IsOptional()
  @IsDateString()
  fds?: Date;

  @ApiProperty({ description: 'Last date of service' })
  @IsOptional()
  @IsDateString()
  lds?: Date;

  @ApiProperty({ description: 'SOL date' })
  @IsOptional()
  @IsDateString()
  solDate?: Date;

  @ApiProperty({ description: 'Ledger option', enum: ['yes', 'no', 'not required'] })
  @IsOptional()
  @IsEnum(['yes', 'no', 'not required'])
  ledger?: string;

  @ApiProperty({ description: 'HCF option', enum: ['yes', 'no', 'not required'] })
  @IsOptional()
  @IsEnum(['yes', 'no', 'not required'])
  hcf?: string;

  @ApiProperty({ description: 'Invoice option', enum: ['yes', 'no', 'not required'] })
  @IsOptional()
  @IsEnum(['yes', 'no', 'not required'])
  invoice?: string;

   @ApiProperty({ description: 'Signin Sheet option', enum: ['yes', 'no', 'not required'] })
  @IsOptional()
  @IsEnum(['yes', 'no', 'not required'])
  signinSheet?: string;

  @ApiProperty({ description: 'Insurance' })
  @IsOptional()
  @IsString()
  insurance?: string;

  @ApiProperty({ description: 'Claim number (array of entries)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MultiEntryDto)
  claimNo?: MultiEntryDto[];

  @ApiProperty({ description: 'Hearing status' })
  @IsOptional()
  @IsString()
  hearingStatus?: string;

  @ApiProperty({ description: 'Hearing date' })
  @IsOptional()
  @IsDateString()
  hearingDate?: Date;

  @ApiProperty({ description: 'Hearing time' })
  @IsOptional()
  @IsString()
  hearingTime?: string;

  @ApiProperty({ description: 'Judge name' })
  @IsOptional()
  @IsString()
  judgeName?: string;

  @ApiProperty({ description: 'Court room link' })
  @IsOptional()
  @IsString()
  courtRoomlink?: string;

  @ApiProperty({ description: 'Judge phone' })
  @IsOptional()
  @IsString()
  judgePhone?: string;

  @ApiProperty({ description: 'Access code' })
  @IsOptional()
  @IsString()
  AccesCode?: string;

  @ApiProperty({ description: 'Board location' })
  @IsOptional()
  @IsString()
  boardLocation?: string;

  @ApiProperty({ description: 'Lien status' })
  @IsOptional()
  @IsString()
  lienStatus?: string;

  @ApiProperty({ 
    description: 'Case status', 
    // MODIFIED: Added enum to ApiProperty
    enum: ['SETTLED', 'C & R (GRANTED)', 'CIC PENDING', 'A & S GRANTED','ADR CASE - SETTED AND PAID ADR','ORDER OF DISMISAAL OF CASE', ''] 
  })
  @IsOptional()
  // MODIFIED: Changed IsString to IsEnum
  @IsEnum(['SETTLED', 'C & R (GRANTED)', 'CIC PENDING', 'A & S GRANTED','ADR CASE - SETTED AND PAID ADR','ORDER OF DISMISAAL OF CASE', '']) 
  caseStatus?: string;

  @ApiProperty({ description: 'Case date' })
  @IsOptional()
  @IsDateString()
  caseDate?: Date;

  @ApiProperty({ description: 'CR amount' })
  @IsOptional()
  @IsNumber()
  crAmount?: number;

  @ApiProperty({ description: 'Adjuster' })
  @IsOptional()
  @IsString()
  adjuster?: string;

  @ApiProperty({ description: 'Adjuster phone' })
  @IsOptional()
  @IsString()
  adjusterPhone?: string;

  @ApiProperty({ description: 'Adjuster fax' })
  @IsOptional()
  @IsString()
  adjusterFax?: string;

  @ApiProperty({ description: 'Adjuster email' })
  @IsOptional()
  @IsString()
  adjusterEmail?: string;

  @ApiProperty({ description: 'Defense attorney' })
  @IsOptional()
  @IsString()
  defenseAttorney?: string;

  @ApiProperty({ description: 'Defense attorney phone' })
  @IsOptional()
  @IsString()
  defenseAttorneyPhone?: string;

  @ApiProperty({ description: 'Defense attorney fax' })
  @IsOptional()
  @IsString()
  defenseAttorneyFax?: string;

  @ApiProperty({ description: 'Defense attorney email' })
  @IsOptional()
  @IsString()
  defenseAttorneyEmail?: string;
}