// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

pragma solidity ^0.8.10;

contract GovernanceStaking is Ownable {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;

  event WithdrawHappened(address indexed to, uint256 amount, uint256 reward);

  IERC20 public rewardToken;
  uint256 public rewardPool;
  uint256 public rewardsOwed;

  uint8 public constant REWARD_FOR_30 = 6;
  uint256 public constant STAKED_FOR_30 = 30 days; // 6% reward for 30 days lock
  uint8 public constant REWARD_FOR_60 = 15;
  uint256 public constant STAKED_FOR_60 = 60 days; // 15% reward for 60 days lock
  uint8 public constant REWARD_FOR_90 = 33;
  uint256 public constant STAKED_FOR_90 = 90 days; // 33% reward for 90 days lock

  enum Option {
    DAYS_30,
    DAYS_60,
    DAYS_90
  }

  struct Coefficient {
    uint32 numerator;
    uint32 denominator;
  }

  struct Stake {
    uint256 amount;
    uint256 stakingTime;
    bool rewardTaken;
    Option option;
    Coefficient coefficient;
  }

  struct TokenInfo {
    uint8 decimals;
    uint256 tvl;
    uint256 allTimeStaked;
    Coefficient coefficient;
  }

  EnumerableSet.AddressSet private _whitelistedTokens;
  mapping(address => TokenInfo) private _tokenInfos;
  mapping(address => mapping(address => Stake)) private _stakes;

  constructor(IERC20 rewardToken_) {
    rewardToken = rewardToken_;
  }

  function whitelistToken(
    address tokenAddress,
    uint32 numerator,
    uint32 denominator
  ) public onlyOwner {
    require(denominator != 0, "Denominator cannot be 0");
    require(!_whitelistedTokens.contains(tokenAddress), "Token with this address already exist");
    _whitelistedTokens.add(tokenAddress);
    _tokenInfos[tokenAddress].coefficient = Coefficient({
      numerator: numerator,
      denominator: denominator
    });
    _tokenInfos[tokenAddress].decimals = IERC20Metadata(tokenAddress).decimals();
  }

  function removeFromWhitelist(address tokenAddress) public onlyOwner {
    require(
      _whitelistedTokens.contains(tokenAddress),
      "Token with this address is not whitelisted"
    );
    _whitelistedTokens.remove(tokenAddress);
  }

  function changeCoefficient(
    address tokenAddress,
    uint32 numerator,
    uint32 denominator
  ) public onlyOwner {
    require(denominator != 0, "Denominator cannot be 0");
    require(
      _whitelistedTokens.contains(tokenAddress),
      "Token with this address is not whitelisted"
    );
    _tokenInfos[tokenAddress].coefficient = Coefficient({
      numerator: numerator,
      denominator: denominator
    });
  }

  /**
   * @dev Adds more tokens to the pool, but first we needs to add allowance for this contract
   */
  function feedRewardPool() public {
    uint256 tokenAmount = rewardToken.allowance(msg.sender, address(this));
    rewardPool += tokenAmount;
    require(
      rewardToken.transferFrom(msg.sender, address(this), tokenAmount),
      "Error in transferFrom function"
    ); //Transfers the tokens to smart contract
  }

  function stake(Option option, address tokenAddress) public {
    // msg.sender
    address sender = msg.sender;
    // staker info
    Stake storage stakerInfo = _stakes[sender][tokenAddress];

    require(
      _whitelistedTokens.contains(tokenAddress),
      "Error: Token with this address is not whitelisted"
    );
    require(
      _stakes[sender][tokenAddress].stakingTime == 0,
      "Error: Only one staking per token per address!!!"
    );
    uint256 tokenAmount = IERC20(tokenAddress).allowance(sender, address(this));
    require(tokenAmount > 0, "Error: Need to increase allowance first");
    // token info
    TokenInfo storage tokenInfo = _tokenInfos[tokenAddress];

    stakerInfo.amount = tokenAmount;
    stakerInfo.option = option;
    stakerInfo.stakingTime = block.timestamp;
    stakerInfo.coefficient = tokenInfo.coefficient;

    uint256 reward = calculateReward(sender, tokenAddress);
    require(
      rewardPool >= reward + rewardsOwed,
      "Error: No enough rewards for You, shouldve thought about this before it went moon"
    );

    // token info
    tokenInfo.tvl += tokenAmount;
    tokenInfo.allTimeStaked += tokenAmount;
    rewardsOwed += reward;
    IERC20(tokenAddress).safeTransferFrom(sender, address(this), tokenAmount);
  }

  /**
   * @dev claims the rewards and stake for the stake, can be only called by the user
   * doesnt work if the campaign isnt finished yet
   */
  function claimRewards(address tokenAddress) public {
    // msg.sender
    address sender = msg.sender;
    // staker info
    Stake storage stakerInfo = _stakes[sender][tokenAddress];

    require(stakerInfo.rewardTaken == false, "Error: You already took the reward");

    uint256 stakedFor = getStakedFor(stakerInfo.option);
    require(stakerInfo.stakingTime != 0, "Error: You are not staked yet for this token");
    require(stakerInfo.stakingTime + stakedFor <= block.timestamp, "Error: Too soon to unstake");

    uint256 reward = calculateReward(sender, tokenAddress);
    uint256 amount = stakerInfo.amount;
    _tokenInfos[tokenAddress].tvl -= amount;
    rewardsOwed -= reward;
    rewardPool -= reward;
    stakerInfo.rewardTaken = true;

    IERC20(tokenAddress).safeTransfer(sender, amount);
    rewardToken.transfer(sender, reward);
    emit WithdrawHappened(sender, amount, reward);
  }

  function calculateReward(address staker, address tokenAddress) public view returns (uint256) {
    uint256 reward;
    Stake memory stakerInfo = _stakes[staker][tokenAddress];

    if (stakerInfo.option == Option.DAYS_30) reward = REWARD_FOR_30;
    else if (stakerInfo.option == Option.DAYS_60) reward = REWARD_FOR_60;
    else if (stakerInfo.option == Option.DAYS_90) reward = REWARD_FOR_90;

    return
      (stakerInfo.amount * reward * stakerInfo.coefficient.numerator) /
      stakerInfo.coefficient.denominator;
  }

  function getStakedFor(Option option) public pure returns (uint256 stakedFor) {
    if (option == Option.DAYS_30) return STAKED_FOR_30;
    if (option == Option.DAYS_60) return STAKED_FOR_60;
    if (option == Option.DAYS_90) return STAKED_FOR_90;
  }

  function getStakerInfo(address stakerAddress, address tokenAddress)
    public
    view
    returns (Stake memory)
  {
    return _stakes[stakerAddress][tokenAddress];
  }

  function getWhitelistedTokens() public view returns (address[] memory) {
    return _whitelistedTokens.values();
  }

  function isTokenWhitelisted(address tokenAddress) public view returns (bool) {
    return _whitelistedTokens.contains(tokenAddress);
  }

  function getTokenInfo(address tokenAddress) public view returns (TokenInfo memory) {
    return _tokenInfos[tokenAddress];
  }
}
