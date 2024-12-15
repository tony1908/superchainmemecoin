package bootstrap

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"strings"

	artifacts2 "github.com/ethereum-optimism/optimism/op-deployer/pkg/deployer/artifacts"

	"github.com/ethereum-optimism/optimism/op-deployer/pkg/env"

	"github.com/ethereum-optimism/optimism/op-deployer/pkg/deployer/standard"

	"github.com/ethereum-optimism/optimism/op-deployer/pkg/deployer/broadcaster"

	"github.com/ethereum-optimism/optimism/op-deployer/pkg/deployer"
	"github.com/ethereum-optimism/optimism/op-deployer/pkg/deployer/opcm"
	opcrypto "github.com/ethereum-optimism/optimism/op-service/crypto"
	"github.com/ethereum-optimism/optimism/op-service/ctxinterrupt"
	"github.com/ethereum-optimism/optimism/op-service/ioutil"
	"github.com/ethereum-optimism/optimism/op-service/jsonutil"
	oplog "github.com/ethereum-optimism/optimism/op-service/log"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/log"
	"github.com/urfave/cli/v2"
)

type DisputeGameConfig struct {
	L1RPCUrl         string
	PrivateKey       string
	Logger           log.Logger
	ArtifactsLocator *artifacts2.Locator

	privateKeyECDSA *ecdsa.PrivateKey

	MinProposalSizeBytes     uint64
	ChallengePeriodSeconds   uint64
	MipsVersion              uint64
	GameKind                 string
	GameType                 uint32
	AbsolutePrestate         common.Hash
	MaxGameDepth             uint64
	SplitDepth               uint64
	ClockExtension           uint64
	MaxClockDuration         uint64
	DelayedWethProxy         common.Address
	AnchorStateRegistryProxy common.Address
	L2ChainId                uint64
	Proposer                 common.Address
	Challenger               common.Address
}

func (c *DisputeGameConfig) Check() error {
	if c.L1RPCUrl == "" {
		return fmt.Errorf("l1RPCUrl must be specified")
	}

	if c.PrivateKey == "" {
		return fmt.Errorf("private key must be specified")
	}

	privECDSA, err := crypto.HexToECDSA(strings.TrimPrefix(c.PrivateKey, "0x"))
	if err != nil {
		return fmt.Errorf("failed to parse private key: %w", err)
	}
	c.privateKeyECDSA = privECDSA

	if c.Logger == nil {
		return fmt.Errorf("logger must be specified")
	}

	if c.ArtifactsLocator == nil {
		return fmt.Errorf("artifacts locator must be specified")
	}

	return nil
}

func DisputeGameCLI(cliCtx *cli.Context) error {
	logCfg := oplog.ReadCLIConfig(cliCtx)
	l := oplog.NewLogger(oplog.AppOut(cliCtx), logCfg)
	oplog.SetGlobalLogHandler(l.Handler())

	l1RPCUrl := cliCtx.String(deployer.L1RPCURLFlagName)
	privateKey := cliCtx.String(deployer.PrivateKeyFlagName)
	artifactsURLStr := cliCtx.String(ArtifactsLocatorFlagName)
	artifactsLocator := new(artifacts2.Locator)
	if err := artifactsLocator.UnmarshalText([]byte(artifactsURLStr)); err != nil {
		return fmt.Errorf("failed to parse artifacts URL: %w", err)
	}

	ctx := ctxinterrupt.WithCancelOnInterrupt(cliCtx.Context)

	return DisputeGame(ctx, DisputeGameConfig{
		L1RPCUrl:         l1RPCUrl,
		PrivateKey:       privateKey,
		Logger:           l,
		ArtifactsLocator: artifactsLocator,
	})
}

func DisputeGame(ctx context.Context, cfg DisputeGameConfig) error {
	if err := cfg.Check(); err != nil {
		return fmt.Errorf("invalid config for DisputeGame: %w", err)
	}

	lgr := cfg.Logger
	progressor := func(curr, total int64) {
		lgr.Info("artifacts download progress", "current", curr, "total", total)
	}

	artifactsFS, cleanup, err := artifacts2.Download(ctx, cfg.ArtifactsLocator, progressor)
	if err != nil {
		return fmt.Errorf("failed to download artifacts: %w", err)
	}
	defer func() {
		if err := cleanup(); err != nil {
			lgr.Warn("failed to clean up artifacts", "err", err)
		}
	}()

	l1Client, err := ethclient.Dial(cfg.L1RPCUrl)
	if err != nil {
		return fmt.Errorf("failed to connect to L1 RPC: %w", err)
	}

	chainID, err := l1Client.ChainID(ctx)
	if err != nil {
		return fmt.Errorf("failed to get chain ID: %w", err)
	}
	chainIDU64 := chainID.Uint64()

	standardVersionsTOML, err := standard.L1VersionsDataFor(chainIDU64)
	if err != nil {
		return fmt.Errorf("error getting standard versions TOML: %w", err)
	}

	signer := opcrypto.SignerFnFromBind(opcrypto.PrivateKeySignerFn(cfg.privateKeyECDSA, chainID))
	chainDeployer := crypto.PubkeyToAddress(cfg.privateKeyECDSA.PublicKey)

	bcaster, err := broadcaster.NewKeyedBroadcaster(broadcaster.KeyedBroadcasterOpts{
		Logger:  lgr,
		ChainID: chainID,
		Client:  l1Client,
		Signer:  signer,
		From:    chainDeployer,
	})
	if err != nil {
		return fmt.Errorf("failed to create broadcaster: %w", err)
	}

	nonce, err := l1Client.NonceAt(ctx, chainDeployer, nil)
	if err != nil {
		return fmt.Errorf("failed to get starting nonce: %w", err)
	}

	host, err := env.DefaultScriptHost(
		bcaster,
		lgr,
		chainDeployer,
		artifactsFS,
	)
	if err != nil {
		return fmt.Errorf("failed to create script host: %w", err)
	}
	host.SetNonce(chainDeployer, nonce)

	var release string
	if cfg.ArtifactsLocator.IsTag() {
		release = cfg.ArtifactsLocator.Tag
	} else {
		release = "dev"
	}

	lgr.Info("deploying dispute game", "release", release)

	dgo, err := opcm.DeployDisputeGame(
		host,
		opcm.DeployDisputeGameInput{
			Release:                  release,
			StandardVersionsToml:     standardVersionsTOML,
			MipsVersion:              cfg.MipsVersion,
			MinProposalSizeBytes:     cfg.MinProposalSizeBytes,
			ChallengePeriodSeconds:   cfg.ChallengePeriodSeconds,
			GameKind:                 cfg.GameKind,
			GameType:                 cfg.GameType,
			AbsolutePrestate:         cfg.AbsolutePrestate,
			MaxGameDepth:             cfg.MaxGameDepth,
			SplitDepth:               cfg.SplitDepth,
			ClockExtension:           cfg.ClockExtension,
			MaxClockDuration:         cfg.MaxClockDuration,
			DelayedWethProxy:         cfg.DelayedWethProxy,
			AnchorStateRegistryProxy: cfg.AnchorStateRegistryProxy,
			L2ChainId:                cfg.L2ChainId,
			Proposer:                 cfg.Proposer,
			Challenger:               cfg.Challenger,
		},
	)
	if err != nil {
		return fmt.Errorf("error deploying dispute game: %w", err)
	}

	if _, err := bcaster.Broadcast(ctx); err != nil {
		return fmt.Errorf("failed to broadcast: %w", err)
	}

	lgr.Info("deployed dispute game")

	if err := jsonutil.WriteJSON(dgo, ioutil.ToStdOut()); err != nil {
		return fmt.Errorf("failed to write output: %w", err)
	}
	return nil
}
