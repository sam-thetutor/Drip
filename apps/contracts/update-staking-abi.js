const fs = require('fs');
const path = require('path');

/**
 * Copy DripStaking ABI from compiled artifacts to frontend
 */
async function updateABI() {
  const artifactPath = path.join(__dirname, 'artifacts/contracts/DripStaking.sol/DripStaking.json');
  const frontendABIPath = path.join(__dirname, '../web/src/lib/contracts/DripStaking.abi.json');

  console.log('Reading compiled artifact...');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  
  console.log('Updating frontend ABI...');
  fs.writeFileSync(frontendABIPath, JSON.stringify(artifact.abi, null, 2));
  
  console.log('✅ DripStaking ABI updated successfully!');
  console.log('   Frontend ABI:', frontendABIPath);
  
  // Verify new functions are included
  const abi = artifact.abi;
  const hasConnectToPool = abi.some(item => item.name === 'connectToPool');
  const hasDisconnectFromPool = abi.some(item => item.name === 'disconnectFromPool');
  const hasIsConnectedToPool = abi.some(item => item.name === 'isConnectedToPool');
  
  console.log('\n✓ New functions in ABI:');
  console.log('  - connectToPool:', hasConnectToPool ? '✓' : '✗');
  console.log('  - disconnectFromPool:', hasDisconnectFromPool ? '✓' : '✗');
  console.log('  - isConnectedToPool:', hasIsConnectedToPool ? '✓' : '✗');
}

updateABI().catch(console.error);
