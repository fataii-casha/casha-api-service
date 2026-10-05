import { AppDataSource } from '../../config/data-source';
import { User, OnboardingStep } from '../user/user.entity';
import { Business, BusinessVerificationStatus } from './business.entity';
import { BusinessDocument, BusinessDocumentType } from './business-document.entity';
import { fileUrl } from '../../middlewares/upload';
import { ApiError } from '../../utils/api-error';

const userRepo = () => AppDataSource.getRepository(User);
const businessRepo = () => AppDataSource.getRepository(Business);
const documentRepo = () => AppDataSource.getRepository(BusinessDocument);

const ALL_DOCUMENT_TYPES = Object.values(BusinessDocumentType);

async function getUserOrThrow(userId: string): Promise<User> {
  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function getBusinessOrThrow(ownerId: string): Promise<Business> {
  const business = await businessRepo().findOne({ where: { ownerId } });
  if (!business) throw ApiError.badRequest('Complete the business info step first');
  return business;
}

interface SetBusinessInfoInput {
  userId: string;
  businessName: string;
  industry: string;
  isRegistered: boolean;
}

export async function setBusinessInfo(input: SetBusinessInfoInput) {
  const user = await getUserOrThrow(input.userId);

  await businessRepo().upsert(
    {
      ownerId: user.id,
      businessName: input.businessName,
      industry: input.industry,
      isRegistered: input.isRegistered,
    },
    { conflictPaths: ['ownerId'] },
  );

  user.businessName = input.businessName;
  user.onboardingStep = OnboardingStep.BUSINESS_INFO;
  await userRepo().save(user);

  return { message: 'Business info saved', onboardingStep: user.onboardingStep };
}

interface UploadBusinessDocumentsInput {
  userId: string;
  rcNumber?: string;
  files: Partial<Record<BusinessDocumentType, Express.Multer.File[]>>;
}

export async function uploadBusinessDocuments(input: UploadBusinessDocumentsInput) {
  const user = await getUserOrThrow(input.userId);
  const business = await getBusinessOrThrow(user.id);

  if (business.isRegistered) {
    if (!input.rcNumber) {
      throw ApiError.badRequest('rcNumber is required for a registered business');
    }

    const missing = ALL_DOCUMENT_TYPES.filter((type) => !input.files[type]?.[0]);
    if (missing.length > 0) {
      throw ApiError.badRequest(`Missing required document(s): ${missing.join(', ')}`);
    }

    business.rcNumber = input.rcNumber;
    await businessRepo().save(business);

    await Promise.all(
      ALL_DOCUMENT_TYPES.map((type) => {
        const file = input.files[type]![0];
        return documentRepo().upsert(
          { businessId: business.id, documentType: type, fileUrl: fileUrl(file.filename) },
          { conflictPaths: ['businessId', 'documentType'] },
        );
      }),
    );
  }
  // Unregistered businesses skip RC + document requirements entirely and just advance.

  user.onboardingStep = OnboardingStep.BUSINESS_DOCUMENTS;
  await userRepo().save(user);

  return { message: 'Business documents saved', onboardingStep: user.onboardingStep };
}

interface SetBusinessAddressInput {
  userId: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  country?: string;
}

export async function setBusinessAddress(input: SetBusinessAddressInput) {
  const user = await getUserOrThrow(input.userId);
  const business = await getBusinessOrThrow(user.id);

  business.addressLine1 = input.addressLine1;
  business.addressLine2 = input.addressLine2;
  business.city = input.city;
  business.state = input.state;
  if (input.country) business.country = input.country;
  await businessRepo().save(business);

  user.onboardingStep = OnboardingStep.BUSINESS_ADDRESS;
  await userRepo().save(user);

  return { message: 'Business address saved', onboardingStep: user.onboardingStep };
}

export async function uploadBusinessLogo(userId: string, file?: Express.Multer.File) {
  const user = await getUserOrThrow(userId);
  const business = await getBusinessOrThrow(user.id);

  if (!file) {
    throw ApiError.badRequest('Logo file is required');
  }

  business.logoUrl = fileUrl(file.filename);
  await businessRepo().save(business);

  user.onboardingStep = OnboardingStep.BUSINESS_LOGO;
  await userRepo().save(user);

  return {
    message: 'Business logo uploaded',
    onboardingStep: user.onboardingStep,
    logoUrl: business.logoUrl,
  };
}

interface SetOwnerDetailsInput {
  userId: string;
  firstName: string;
  lastName: string;
  otherName?: string;
  dob: string;
  isPoliticallyExposed: boolean;
}

export async function setOwnerDetails(input: SetOwnerDetailsInput) {
  const user = await getUserOrThrow(input.userId);

  user.firstName = input.firstName;
  user.lastName = input.lastName;
  user.otherName = input.otherName;
  user.dob = input.dob;
  user.isPoliticallyExposed = input.isPoliticallyExposed;
  user.onboardingStep = OnboardingStep.OWNER_DETAILS;

  await userRepo().save(user);

  return {
    message: 'Owner details saved',
    onboardingStep: user.onboardingStep,
    isPoliticallyExposed: user.isPoliticallyExposed,
  };
}

export async function getMyBusiness(ownerId: string): Promise<Business> {
  return getBusinessOrThrow(ownerId);
}
