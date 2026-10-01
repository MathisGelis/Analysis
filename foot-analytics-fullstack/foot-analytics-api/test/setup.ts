// Silence le Logger Nest (traces debug des services) pendant les tests.
import { Logger } from "@nestjs/common";

Logger.overrideLogger(false);
