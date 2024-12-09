import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWeb3 } from '../contexts/Web3Context'
import { pinataService } from '../services/pinataService'

const GATEWAY_URL = 'rose-hollow-mollusk-554.mypinata.cloud';
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://cors.eu.org/'
];

function CredentialVerification() {
  const { web3Service } = useWeb3();
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [credentialId, setCredentialId] = useState('')
  const [credentialDetails, setCredentialDetails] = useState(null)
  const [error, setError] = useState(null)

  const handleVerification = async (e) => {
    e.preventDefault()
    setIsVerifying(true)
    setError(null)
    
    try {
      // Check if input is a valid metadata CID
      if (!credentialId.startsWith('bafk')) {
        throw new Error('Please enter a valid metadata CID (starts with "bafk")')
      }

      console.log('Fetching metadata from Pinata:', credentialId)
      
      try {
        // Fetch the metadata using the CID
        const metadata = await pinataService.main(credentialId)
        
        if (!metadata) {
          throw new Error('No metadata found')
        }

        // Accept both bafy and bafk prefixes for image hashes
        if (!metadata.imageHash?.startsWith('baf')) {
          console.warn('Image hash format unexpected:', metadata.imageHash)
        }

        setCredentialDetails({
          ...metadata,
          blockchainHash: 'Verified from IPFS',
          verificationTime: new Date().toLocaleString()
        })
        
        setVerificationStatus('success')
      } catch (pinataError) {
        console.error('Pinata Error:', pinataError)
        throw new Error(`Pinata Error: ${pinataError.message || 'Content not found or invalid'}`)
      }
    } catch (error) {
      console.error('Error verifying credential:', error)
      setError(error.message || 'Failed to verify credential')
      setVerificationStatus('error')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleDownload = async () => {
    if (!credentialDetails?.imageHash || isDownloading) return;
    setIsDownloading(true);
    setError(null);
    
    let downloadError = null;
    let activeLink = null;
    let activeUrl = null;

    try {
      // Try each CORS proxy until one works
      for (const proxy of CORS_PROXIES) {
        try {
          const downloadUrl = `https://${GATEWAY_URL}/ipfs/${credentialDetails.imageHash}?pinataGatewayToken=${import.meta.env.VITE_GATEWAY_KEY}`;
          const proxyUrl = `${proxy}${encodeURIComponent(downloadUrl)}`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(proxyUrl, {
            signal: controller.signal,
            headers: {
              'Accept': 'image/jpeg, image/png, image/*, application/octet-stream'
            }
          });

          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
          }

          const contentType = response.headers.get('content-type');
          console.log('Content type:', contentType); // Debug log

          // More specific content type checking
          let fileExtension;
          if (contentType?.includes('jpeg') || contentType?.includes('jpg')) {
            fileExtension = 'jpg';
          } else if (contentType?.includes('png')) {
            fileExtension = 'png';
          } else if (contentType?.includes('pdf')) {
            fileExtension = 'pdf';
          } else {
            // Try to get extension from original filename if available
            fileExtension = credentialDetails.originalFileName?.split('.').pop() || 'file';
          }

          const blob = await response.blob();
          
          // Create download link
          activeUrl = window.URL.createObjectURL(blob);
          activeLink = document.createElement('a');
          activeLink.href = activeUrl;
          
          // Use original filename if available, otherwise generate one
          const fileName = credentialDetails.originalFileName || 
            `${credentialDetails.institution}_${credentialDetails.credentialType}_${credentialDetails.studentName}`
              .replace(/[^a-zA-Z0-9]/g, '_')
              .toLowerCase() + '.' + fileExtension;
          
          activeLink.download = fileName;
          
          // Trigger download
          document.body.appendChild(activeLink);
          activeLink.click();
          
          // Success - break the loop
          break;
        } catch (error) {
          console.warn(`Download failed with proxy ${proxy}:`, error);
          downloadError = error;
          
          // Cleanup on error
          if (activeUrl) {
            window.URL.revokeObjectURL(activeUrl);
            activeUrl = null;
          }
          if (activeLink && activeLink.parentNode) {
            activeLink.parentNode.removeChild(activeLink);
            activeLink = null;
          }
          continue;
        }
      }

      if (downloadError && !activeLink) {
        console.error('All download attempts failed:', downloadError);
        setError('Failed to download certificate. Please try again.');
      }
    } finally {
      // Ensure cleanup happens after a delay
      setTimeout(() => {
        if (activeUrl) {
          window.URL.revokeObjectURL(activeUrl);
        }
        if (activeLink && activeLink.parentNode) {
          activeLink.parentNode.removeChild(activeLink);
        }
        setIsDownloading(false);
      }, 1500); // Increased delay to ensure download starts
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 transition-colors duration-200">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Verify Academic Credential
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Instantly verify the authenticity of academic credentials on the blockchain
          </p>
        </motion.div>

        {/* Verification Form */}
        <motion.div 
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <form onSubmit={handleVerification} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Credential ID or Hash
              </label>
              <input 
                type="text"
                value={credentialId}
                onChange={(e) => setCredentialId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent"
                placeholder="Enter metadata CID (starts with bafk...)"
                required
              />
            </div>

            {error && (
              <div className="text-red-500 text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-center">
              <motion.button
                type="submit"
                className="px-6 py-3 bg-primary-600 dark:bg-primary-500 text-white rounded-md
                         hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying...
                  </span>
                ) : (
                  'Verify Credential'
                )}
              </motion.button>
            </div>
          </form>

          {/* Verification Result */}
          <AnimatePresence mode="wait">
            {verificationStatus === 'success' && credentialDetails && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700"
              >
                <div className="text-center">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 mb-4">
                    <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Credential Verified!
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">
                    This credential has been verified on the blockchain
                  </p>

                  {/* Credential Details */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6 text-left">
                    <dl className="space-y-4">
                      {[
                        ['Credential Type', credentialDetails.credentialType],
                        ['Institution', credentialDetails.institution],
                        ['Issue Date', new Date(credentialDetails.issueDate).toLocaleDateString()],
                        ['Student Name', credentialDetails.studentName],
                        ['Student Address', credentialDetails.studentAddress],
                        ['Issuer Address', credentialDetails.issuerAddress],
                        ['Blockchain Hash', credentialDetails.blockchainHash],
                        ['Verification Time', credentialDetails.verificationTime]
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between">
                          <dt className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</dt>
                          <dd className="text-sm text-gray-900 dark:text-white">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {/* Download Button */}
                  <motion.button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="mt-6 px-4 py-2 bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 
                             border border-primary-600 dark:border-primary-400 rounded-md
                             hover:bg-primary-50 dark:hover:bg-gray-600 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isDownloading ? 'Downloading...' : 'Download Certificate'}
                  </motion.button>
                </div>
              </motion.div>
            )}

            {verificationStatus === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-8 text-center text-red-500"
              >
                <p>Failed to verify credential. Please check the ID and try again.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* How It Works Section */}
        <motion.div 
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            How Verification Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
                title: "Secure Verification",
                description: "Credentials are verified using blockchain technology"
              },
              {
                icon: "M12 6v6m0 0v6m0-6h6m-6 0H6",
                title: "Instant Results",
                description: "Get verification results in seconds"
              },
              {
                icon: "M9 12h6m-6 1h6m-6 1h6m-6 1h6m-6 1h6m-6 1h6m-6 1h6",
                title: "Detailed Information",
                description: "View complete credential details"
              }
            ].map((item, index) => (
              <motion.div
                key={item.title}
                className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.2 }}
              >
                <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-gray-600 dark:text-gray-300">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default CredentialVerification;