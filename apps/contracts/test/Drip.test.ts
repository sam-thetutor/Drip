import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployDripFixture } from "./fixtures/DripFixture";
import { ethers } from "hardhat";

/**
 * @title Drip Contract Tests
 * @notice Basic test structure for Drip contracts
 * @dev These tests will be expanded in Milestone 2 when contracts are implemented
 */
describe("Drip Contracts", function () {
  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { dripCore } = await loadFixture(deployDripFixture);
      
      expect(dripCore.target).to.be.properAddress;
    });

    it("Should have correct contract address", async function () {
      const { dripCore } = await loadFixture(deployDripFixture);
      
      expect(dripCore.target).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("Interfaces", function () {
    it("Should implement IDrip interface", async function () {
      // This test will be expanded when DripCore is implemented
      // For now, we just verify the fixture works
      const { dripCore } = await loadFixture(deployDripFixture);
      
      expect(dripCore.target).to.be.properAddress;
    });
  });
});

