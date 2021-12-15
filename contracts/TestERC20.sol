// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
  // solhint-disable-next-line no-empty-blocks
  constructor() ERC20("TestERC20", "TE") {}

  function mint(uint256 amount) public {
    _mint(msg.sender, amount);
  }
}
