// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * Mock Super Token for testing DripStaking deployment
 * In production, use wrapped GoodDollar or another Superfluid-compatible token
 */
contract MockSuperToken is ERC20 {
  constructor() ERC20("Mock Super GoodDollar", "mGDx") {
    _mint(msg.sender, 1_000_000 * 10 ** 18); // 1M tokens
  }

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }

  function burn(uint256 amount) external {
    _burn(msg.sender, amount);
  }
}
