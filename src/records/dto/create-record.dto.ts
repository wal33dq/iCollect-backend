import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsNumber,
} from 'class-validator';

export class CreateRecordDto {

     @IsString()
  @IsNotEmpty()
  provider: string;

  @IsOptional()
  @IsString()
  renderingFacility?: string;

@IsOptional()
  @IsString()
  taxId?: string;
  
  @IsString()
  @IsNotEmpty()
  ptName: string;


  @IsOptional()
  @IsDateString()
  dob?: Date;

  @IsOptional()
  @IsString()
  ssn?: string;

  @IsOptional()
  @IsString()
  employer?: string;

  @IsOptional()
  @IsString()
  insurance?: string;

  @IsOptional()
  @IsNumber()
  bill?: number;

  @IsOptional()
  @IsDateString()
  fds?: Date; // First Date of Service

  @IsOptional()
  @IsDateString()
  lds?: Date; // Last Date of Service

  @IsOptional()
  @IsDateString()
  solDate?: Date; // Statute of Limitations
}
