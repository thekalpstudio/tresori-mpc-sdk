import { ethers } from 'ethers';

// ── Deployed Contract Addresses ──

interface ContractAddresses {
  Facade: string;
  IdentityRegistry: string;
  CredentialRegistry: string;
  IssuerRegistry: string;
  DelegationManager: string;
  ZKVerifier: string;
}

const CONTRACTS_BY_CHAIN: Record<number, ContractAddresses> = {
  80002: {
    Facade: '0x46C1F446c6183aBD67493aB15AD308D1b2e493c4',
    IdentityRegistry: '0xA32E0b7e85C368c18D7DA03736e52fbafc9CB32B',
    CredentialRegistry: '0x14c52AbeCB82E33Bcf9570bD83701979a792b730',
    IssuerRegistry: '0xa70B3DF81Bc7Dc57a4feF51108EB9BD0139cC4c7',
    DelegationManager: '0xF17801889f697765ebf68Dfd1488B9D8adec6a33',
    ZKVerifier: '0xF59dB5e7b713d44f63B8ae32D3228e075D8e2b03',
  },
  137: {
    Facade: '0x85539fC1577676a64A2022F0a778A2d38a447CAa',
    IdentityRegistry: '0x5B09Bf3a7Fec10BDE820CbFC76a14cFCe17ABe75',
    CredentialRegistry: '0xF1aBD88910494a30527E1184081979D693bB3aAF',
    IssuerRegistry: '0x6358A9b5c27d301CbC92db3c100D1b110F336F8e',
    DelegationManager: '0x937C39f2a00250Df91BE0d69e997c712C9b605d1',
    ZKVerifier: '0x15A771E553aD4A2011317904951C5F1BcfC0Ce43',
  },
};

export function getIdentityContracts(chainId: number): ContractAddresses | null {
  return CONTRACTS_BY_CHAIN[chainId] ?? null;
}

// ── Credential Type Hashes (must match IdentityTypes.sol) ──

export const CRED_KYC_AML = ethers.utils.id('KYC_AML');
export const CRED_ACCREDITED = ethers.utils.id('ACCREDITED_INV'); // contract uses ACCREDITED_INV
export const CRED_SANCTIONS = ethers.utils.id('SANCTIONS_CLEAR');
export const CRED_RWA_HOLDER = ethers.utils.id('RWA_HOLDER');

export const CREDENTIAL_TYPES = [
  { label: 'KYC / AML', hash: CRED_KYC_AML },
  { label: 'Accredited Investor', hash: CRED_ACCREDITED },
  { label: 'Sanctions Clear', hash: CRED_SANCTIONS },
  { label: 'RWA Holder', hash: CRED_RWA_HOLDER },
] as const;

// ── Permission Hashes ──

export const PERM_TRANSACT = ethers.utils.id('TRANSACT');
export const PERM_VIEW = ethers.utils.id('VIEW');
export const PERM_SIGN = ethers.utils.id('SIGN');
export const PERM_STAKE = ethers.utils.id('STAKE');

export const PERMISSIONS = [
  { label: 'Transact', hash: PERM_TRANSACT },
  { label: 'View', hash: PERM_VIEW },
  { label: 'Sign', hash: PERM_SIGN },
  { label: 'Stake', hash: PERM_STAKE },
] as const;

// ── ABI Fragments (matching actual Solidity signatures) ──

export const IDENTITY_REGISTRY_ABI = [
  // createIdentity takes bytes32 metadataURI (IPFS CID encoded as bytes32)
  'function createIdentity(bytes32 metadataURI) external returns (bytes32)',
  'function resolveDID(address wallet) external view returns (bytes32)',
  'function getIdentity(bytes32 did) external view returns (tuple(bytes32 did, address owner, address[] controllers, bytes32 metadataURI, uint8 status, uint256 createdAt, uint256 updatedAt))',
  'function isActiveDID(bytes32 did) external view returns (bool)',
  'function updateMetadata(bytes32 did, bytes32 metadataURI) external',
  'function addController(bytes32 did, address controller) external',
  'function removeController(bytes32 did, address controller) external',
];

export const CREDENTIAL_REGISTRY_ABI = [
  'function issue(bytes32 did, bytes32 credType, bytes32 dataHash, uint256 expiresAt, bytes signature) external',
  'function verify(address subject, bytes32 credType) external view returns (bool)',
  'function getCredential(address subject, bytes32 credType) external view returns (tuple(address issuer, bytes32 credType, bytes32 dataHash, uint256 issuedAt, uint256 expiresAt, bool revoked, bytes signature))',
  'function getCredentialByDID(bytes32 did, bytes32 credType) external view returns (tuple(address issuer, bytes32 credType, bytes32 dataHash, uint256 issuedAt, uint256 expiresAt, bool revoked, bytes signature))',
  'function DOMAIN_SEPARATOR() external view returns (bytes32)',
];

export const ISSUER_REGISTRY_ABI = [
  'function isTrustedIssuer(address issuer, bytes32 credType) external view returns (bool)',
  'function getIssuer(address issuer) external view returns (tuple(address issuerAddress, uint8 tier, bytes32[] allowedCredTypes, uint256 addedAt, bool active))',
];

export const FACADE_ABI = [
  'function verify(address subject, bytes32 credType) external view returns (bool)',
  'function getCredential(address subject, bytes32 credType) external view returns (tuple(address issuer, bytes32 credType, bytes32 dataHash, uint256 issuedAt, uint256 expiresAt, bool revoked, bytes signature))',
  'function resolveDID(address wallet) external view returns (bytes32)',
];

export const DELEGATION_MANAGER_ABI = [
  'function createAgentDID(bytes32 principalDID, address agentAddress) external returns (bytes32)',
  'function grantPermission(bytes32 principalDID, address agentAddress, bytes32 permission, uint256 expiresAt) external',
  'function revokePermission(bytes32 principalDID, address agentAddress, bytes32 permission) external',
  'function isControllerView(bytes32 principalDID, address agentAddress, bytes32 permission) external view returns (bool)',
  'function getDelegation(address agentAddress, bytes32 principalDID, bytes32 permission) external view returns (tuple(bytes32 principalDID, address agentAddress, bytes32[] permissions, uint256 expiresAt, bool revoked))',
  'function getAgentDID(address agentAddress) external view returns (bytes32)',
  'function getPrincipalDID(bytes32 agentDID) external view returns (bytes32)',
];

// ── Supported chains for identity contracts ──

export const IDENTITY_CHAIN_IDS: readonly number[] = [80002, 137];
